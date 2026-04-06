import app from "./index";

export default async function handler(req: any, res: any) {
  // Express app does not return a promise; wait until the response is done.
  return new Promise<void>((resolve, reject) => {
    res.once("finish", resolve);
    res.once("close", resolve);
    try {
      app(req, res);
    } catch (err) {
      reject(err);
    }
  });
}

