import app from "./index.ts";

export default async function handler(req: any, res: any) {
  // Express app is callback-based; resolve when response is finished.
  return new Promise<void>((resolve, reject) => {
    res.once("finish", resolve);
    res.once("close", resolve);
    try {
      app(req, res);
    } catch (error) {
      reject(error);
    }
  });
}
