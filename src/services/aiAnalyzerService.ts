import { GoogleGenAI, Type as GenAIType } from "@google/genai";
import { Difference } from '../types';

interface AnalyzeParams {
  designImageStr: string;
  buildImageStr: string;
  selectedModel: string;
  liveImageSize: { width: number; height: number };
  abortSignal?: AbortSignal;
}

const compressImage = (
  base64: string,
  maxWidth = 1600,
  quality = 0.8,
): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    if (!base64.startsWith("data:")) {
      img.crossOrigin = "anonymous";
    }
    img.src = base64;
    img.onload = () => {
      const canvas = document.createElement("canvas");
      let width = img.width;
      let height = img.height;

      if (width > maxWidth) {
        height = (maxWidth / width) * height;
        width = maxWidth;
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      } else {
        resolve(base64);
      }
    };
    img.onerror = () => resolve(base64);
  });
};

const getBase64 = async (url: string): Promise<{ data: string, mimeType: string }> => {
  if (url.startsWith('data:')) {
    const [mime, data] = url.split(',');
    return { 
      data, 
      mimeType: mime.split(':')[1].split(';')[0] 
    };
  }
  
  try {
    const proxyUrl = `/api/get-image?url=${encodeURIComponent(url)}`;
    console.log(`Fetching image: ${proxyUrl}`);
    const response = await fetch(proxyUrl);
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Proxy failed (${response.status}): ${errorText || response.statusText}`);
    }
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = (reader.result as string).split(',')[1];
        resolve({ data: base64, mimeType: blob.type });
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (e: any) {
    throw new Error(`Failed to fetch image: ${e.message}`);
  }
};

const getImageDimensions = (url: string): Promise<{ width: number, height: number }> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve({ width: 0, height: 0 });
    img.src = url;
  });
};

export const analyzeUiDifferences = async ({
  designImageStr,
  buildImageStr,
  selectedModel,
  liveImageSize,
  abortSignal
}: AnalyzeParams): Promise<Difference[]> => {
  const compressedDesign = await compressImage(designImageStr, 1600, 0.8);
  const compressedBuild = await compressImage(buildImageStr, 1600, 0.8);

  const [designImg, buildImg] = await Promise.all([
    getBase64(compressedDesign),
    getBase64(compressedBuild)
  ]);

  const [naturalDesignDims, naturalBuildDims] = await Promise.all([
    getImageDimensions(designImageStr),
    getImageDimensions(buildImageStr)
  ]);

  const prompt = `
    你是一位细致入微的 UI/UX QA 工程师。请以像素级的精度对比这两张图片。
    图片 1 是 设计稿 (DESIGN SOURCE)（预期设计）。
    图片 2 是 开发稿 (BUILD SOURCE)（实际实现）。
    
    识别它们之间的视觉差异。重点关注：
    1. 内容 (CONTENT)：寻找完全缺失的元素、多余的元素或错误不匹配的图标。
    2. 布局 (LAYOUT)：绝对/相对对齐问题、间距差异（内/外边距）、位置错乱或元素尺寸不匹配。
    3. 样式 (STYLE)：背景或文本颜色改变、字体粗细/大小的微差、边框/圆角/阴影配置错误或透明度异常。
    
    对于每个差异，你必须评估其严重程度 (severity):
    - high: 严重阻塞或明显的视觉错误（如关键按钮缺失、布局错位超过 20px、主色调错误）。
    - medium: 中等影响（如字体大小差 2-4px、内边距不一致、次要文本颜色微差）。
    - low: 轻微改进（如 1px 的对齐偏差、图标微小位移）。

    关于坐标的关键指令：
    对于每个差异，你必须提供一个相对于 开发构建稿（即图片 2，Build 原型图）的精确像素边界框 (rect)。
    - x: 距离构建稿左边缘的距离。
    - y: 距离构建稿顶边缘的距离。
    - width: 受影响区域的宽度。
    - height: 受影响区域的高度。
    
    设计稿的真实尺寸是 ${naturalDesignDims.width}x${naturalDesignDims.height}。
    开发构建稿（图片 2）的真实尺寸是 ${naturalBuildDims.width}x${naturalBuildDims.height}。
    
    ${selectedModel === 'doubao' ? '【特别注意】：豆包模型在处理坐标时，请务必使用基于原始像素尺寸的绝对值（x 在 0-' + naturalBuildDims.width + ' 之间，y 在 0-' + naturalBuildDims.height + ' 之间）。请检查你的输出，确保它们不是 0-1000 的归一化坐标。如果你的内部视觉系统使用归一化坐标，请务必将其乘以开发构建稿的图片尺寸转换为像素后再返回。' : '【特别注意】：请务必确保坐标 (x, y, width, height) 是基于原始像素尺寸（图片 2）的，不要进行归一化或缩放。请仔细核对坐标位置，确保框选区域与视觉差异点完全重合。'}
    
    如果图片没有完美对齐，请在识别差异之前，先根据关键地标（如页眉或徽标）在心理上对齐它们。
    
    以 JSON 对象数组的形式返回结果。将结果限制在最重要的 15 个差异内。
    重要提示：所有文本字段（title, description）必须使用简体中文。
    【极度重要：JSON格式严格要求】：
    1. 你必须输出纯粹且完美的 JSON 数组。
    2. JSON 中的字符串字段内部**绝对不允许**出现物理换行符（Raw Newlines）。任何需要在文本中换行的地方，**必须**写成转义的 \\n。
    3. 检查并闭合所有引号，禁止输出未完成的字符串。
  `;

  const parseJsonSafe = (text: string) => {
    let cleanText = text;
    // Extract JSON block if surrounded by markdown
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch) cleanText = jsonMatch[1];
    
    // Fix unescaped physical newlines inside strings using a regex approach
    // We basically remove unescaped newlines that appear before the terminal quote of a line, 
    // but the safest and easiest way is to try standard parsing first.
    try {
      return JSON.parse(cleanText.trim());
    } catch (e: any) {
      console.warn("Standard JSON parse failed, attempting sanitation...", e);
      // Rough fix for unescaped newlines in JSON strings:
      // Replace literal newlines within quotes. This is complex via Regex,
      // so we use a state machine or simply replace newlines that don't match typical JSON structures.
      let sanitized = '';
      let inString = false;
      let escapeNext = false;
      for (let i = 0; i < cleanText.length; i++) {
        const char = cleanText[i];
        if (escapeNext) {
          sanitized += char;
          escapeNext = false;
        } else if (char === '\\') {
          sanitized += char;
          escapeNext = true;
        } else if (char === '"') {
          inString = !inString;
          sanitized += char;
        } else if (char === '\n' || char === '\r') {
          if (inString) {
            sanitized += '\\n'; // Replace physical newline with escaped newline
          } else {
            sanitized += char;
          }
        } else {
          sanitized += char;
        }
      }
      let currentSanitized = sanitized.trim();
      try {
        return JSON.parse(currentSanitized);
      } catch (finalError) {
        // If it's still failing, it might be truncated (e.g. max tokens reached)
        console.warn("Sanitized JSON parse failed, attempting truncation recovery...");
        
        // Very basic truncation recovery for JSON arrays
        if (currentSanitized.startsWith('[')) {
          // Find the last complete object
          const lastValidBrace = currentSanitized.lastIndexOf('}');
          if (lastValidBrace !== -1) {
            const cutString = currentSanitized.substring(0, lastValidBrace + 1) + ']';
            try {
              return JSON.parse(cutString);
            } catch (e) {
              console.error("Complete JSON parsing failure:", e);
              throw finalError; // Throw the original error if recovery fails completely
            }
          }
        }
        throw finalError;
      }
    }
  };

  let result;
  if (selectedModel === 'gemini') {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error("Gemini API key is missing. Please ensure it is set in your environment variables.");
    }
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const model = "gemini-3.1-pro-preview";

    const aiPromise = ai.models.generateContent({
      model,
      contents: [
        {
          parts: [
            { text: prompt },
            { inlineData: designImg },
            { inlineData: buildImg }
          ]
        }
      ],
      config: {
        responseMimeType: "application/json",
        maxOutputTokens: 8192,
        responseSchema: {
          type: GenAIType.ARRAY,
          items: {
            type: GenAIType.OBJECT,
            properties: {
              title: { type: GenAIType.STRING },
              type: { type: GenAIType.STRING, enum: ['CONTENT', 'LAYOUT', 'STYLE'] },
              severity: { type: GenAIType.STRING, enum: ['high', 'medium', 'low'] },
              description: { type: GenAIType.STRING },
              rect: {
                type: GenAIType.OBJECT,
                properties: {
                  x: { type: GenAIType.NUMBER },
                  y: { type: GenAIType.NUMBER },
                  width: { type: GenAIType.NUMBER },
                  height: { type: GenAIType.NUMBER }
                },
                required: ['x', 'y', 'width', 'height']
              }
            },
            required: ['title', 'type', 'severity', 'description', 'rect']
          }
        }
      }
    });

    const response = await (abortSignal ? Promise.race([
      aiPromise,
      new Promise<any>((_, reject) => {
        const handler = () => reject(new DOMException('Aborted', 'AbortError'));
        if (abortSignal.aborted) return handler();
        abortSignal.addEventListener('abort', handler);
      })
    ]) : aiPromise);
    result = parseJsonSafe(response.text || '[]');
  } else {
    const response = await fetch("/api/analyze/ui", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        prompt,
        designImg,
        buildImg,
        model: selectedModel
      }),
      signal: abortSignal
    });

    if (!response.ok) {
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Kimi analysis failed");
      } else {
        const errorText = await response.text();
        throw new Error(`Kimi analysis failed (${response.status}): ${errorText.substring(0, 100)}`);
      }
    }

    const responseContentType = response.headers.get("content-type");
    if (responseContentType && responseContentType.includes("application/json")) {
      const data = await response.json();
      result = typeof data === 'string' ? parseJsonSafe(data) : data;
    } else {
      const text = await response.text();
      try {
        result = parseJsonSafe(text);
      } catch(e) {
        console.error(`Unexpected response format from backend (${response.status}):`, text.substring(0, 500));
        throw new Error(`Unexpected response format from backend (${response.status}): Expected JSON but received ${responseContentType || "unknown"}. This often happens if the server is restarting or if the API route is not matched.`);
      }
    }
  }

  return result.map((d: any, index: number) => {
    const type = (d.type || 'style').toLowerCase();
    const validTypes = ['content', 'layout', 'style'];
    
    let rect = d.rect || { x: 0, y: 0, width: 0, height: 0 };
    
    const isNormalized1 = rect.x <= 1 && rect.y <= 1 && rect.width <= 1 && rect.height <= 1;

    if (isNormalized1 && (rect.width > 0 || rect.height > 0)) {
      rect = {
        x: rect.x * naturalBuildDims.width,
        y: rect.y * naturalBuildDims.height,
        width: rect.width * naturalBuildDims.width,
        height: rect.height * naturalBuildDims.height
      };
    }

    const appWidth = liveImageSize.width || 390;
    const appHeight = liveImageSize.height || (naturalBuildDims.height * (appWidth / naturalBuildDims.width));
    
    const scaleX = naturalBuildDims.width > 0 ? (appWidth / naturalBuildDims.width) : 1;
    const scaleY = naturalBuildDims.height > 0 ? (appHeight / naturalBuildDims.height) : 1;
    
    rect = {
      x: Math.round(rect.x * scaleX),
      y: Math.round(rect.y * scaleY),
      width: Math.round(rect.width * scaleX),
      height: Math.round(rect.height * scaleY)
    };
    
    return {
      ...d,
      rect,
      id: (index + 1).toString(),
      type: validTypes.includes(type) ? type : 'style',
      severity: d.severity || 'medium',
      status: 'pending'
    };
  });
};
