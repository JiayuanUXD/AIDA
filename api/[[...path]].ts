import app from "./index.ts";

export default async function handler(req: any, res: any) {
  // For Vercel serverless, we need to handle the request/response
  return new Promise<void>((resolve, reject) => {
    // Attach handlers before calling app
    const onFinish = () => {
      res.removeListener("close", onClose);
      resolve();
    };
    
    const onClose = () => {
      res.removeListener("finish", onFinish);
      resolve();
    };

    res.once("finish", onFinish);
    res.once("close", onClose);

    try {
      // Call the Express app with the request/response
      app.handle ? app.handle(req, res) : app(req, res);
    } catch (err) {
      res.removeListener("finish", onFinish);
      res.removeListener("close", onClose);
      reject(err);
    }
  });
}
