const testParsing = (content) => {
  let result;
  let finalContent = content;

  try {
    if (typeof content === 'string') {
      try {
        const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
        const rawToParse = jsonMatch ? jsonMatch[1].trim() : content.trim();
        result = JSON.parse(rawToParse);
        finalContent = rawToParse;
      } catch (initialError) {
        let cleanContent = content;
        
        const firstBracket = content.indexOf('[');
        const firstBrace = content.indexOf('{');
        const lastBracket = content.lastIndexOf(']');
        const lastBrace = content.lastIndexOf('}');
        
        let start = -1;
        let end = -1;
        
        if (firstBracket !== -1 && (firstBrace === -1 || firstBracket < firstBrace)) {
          start = firstBracket;
          end = lastBracket;
        } else if (firstBrace !== -1) {
          start = firstBrace;
          end = lastBrace;
        }
        
        if (start !== -1 && end !== -1 && end > start) {
          cleanContent = content.substring(start, end + 1);
        }

        cleanContent = cleanContent
          .replace(/\/\/.*$/gm, '')
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/([{,]\s*)'(\w+)'(\s*:)/g, '$1"$2"$3')
          .replace(/([{,]\s*)(\w+)(\s*:)/g, '$1"$2"$3')
          .replace(/,\s*([}\]])/g, '$1')
          .trim();

        result = JSON.parse(cleanContent);
        finalContent = cleanContent;
      }
    } else {
      result = content;
    }
    console.log("Success:", JSON.stringify(result, null, 2));
  } catch (e) {
    console.log("Failed!");
    console.log("Error:", e.message);
  }
};

console.log("Test 1: Normal JSON");
testParsing('{"a": 1}');

console.log("\nTest 2: Markdown JSON");
testParsing('Here is your JSON:\n```json\n{"a": 1}\n```');

console.log("\nTest 3: Single quotes and trailing comma");
testParsing("{ 'a': 1, }");

console.log("\nTest 4: Missing quotes on key");
testParsing("{ a: 1 }");

console.log("\nTest 5: Complex with text before/after");
testParsing("Result: [ { \"title\": \"Test\" } ] End.");

console.log("\nTest 6: The problematic case (quotes in value)");
testParsing('{\n  "title": "Style",\n  "description": "It\'s a \"special\" case"\n}');
