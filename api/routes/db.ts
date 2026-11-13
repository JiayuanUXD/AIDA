import { Router } from "express";
import { readCollection, writeCollection, withCollectionLock } from "../lib/store.js";
import { isAllowedCollection } from "../lib/security.js";
import { asyncHandler } from "../lib/http.js";

const router = Router();

const errorStatus = (err: any) => err?.status || 500;

router.get("/:collection", asyncHandler(async (req, res) => {
  const { collection } = req.params;
  if (!isAllowedCollection(collection)) {
    return res.status(403).json({ error: `Collection "${collection}" is not allowed` });
  }
  const data = await readCollection(collection);
  res.json(data);
}));

router.get("/:collection/:id", asyncHandler(async (req, res) => {
  const { collection } = req.params;
  if (!isAllowedCollection(collection)) {
    return res.status(403).json({ error: `Collection "${collection}" is not allowed` });
  }
  const data = await readCollection(collection);
  const doc = data.find((d: any) => d.id === req.params.id);
  if (!doc) return res.status(404).json({ error: "Not found" });
  res.json(doc);
}));

router.post("/:collection", asyncHandler(async (req, res) => {
  const { collection } = req.params;
  if (!isAllowedCollection(collection)) {
    return res.status(403).json({ error: `Collection "${collection}" is not allowed` });
  }
  try {
    const newDoc = await withCollectionLock(collection, async () => {
      const data = await readCollection(collection);
      const doc = {
        ...req.body,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      data.push(doc);
      await writeCollection(collection, data);
      return doc;
    });
    res.json(newDoc);
  } catch (err: any) {
    console.error(`[POST /api/db/${collection}] Error:`, err);
    res.status(errorStatus(err)).json({ error: err.message || 'Failed to save data' });
  }
}));

router.put("/:collection/:id", asyncHandler(async (req, res) => {
  const { collection } = req.params;
  if (!isAllowedCollection(collection)) {
    return res.status(403).json({ error: `Collection "${collection}" is not allowed` });
  }
  try {
    const doc = await withCollectionLock(collection, async () => {
      const data = await readCollection(collection);
      const index = data.findIndex((d: any) => d.id === req.params.id);
      if (index === -1) {
        const created = { ...req.body, id: req.params.id, updatedAt: Date.now() };
        data.push(created);
        await writeCollection(collection, data);
        return created;
      }
      data[index] = { ...data[index], ...req.body, updatedAt: Date.now() };
      await writeCollection(collection, data);
      return data[index];
    });
    res.json(doc);
  } catch (err: any) {
    console.error(`[PUT /api/db/${collection}/${req.params.id}] Error:`, err);
    res.status(errorStatus(err)).json({ error: err.message || 'Failed to save data' });
  }
}));

router.delete("/:collection/:id", asyncHandler(async (req, res) => {
  const { collection } = req.params;
  if (!isAllowedCollection(collection)) {
    return res.status(403).json({ error: `Collection "${collection}" is not allowed` });
  }
  try {
    await withCollectionLock(collection, async () => {
      const data = await readCollection(collection);
      const filtered = data.filter((d: any) => d.id !== req.params.id);
      await writeCollection(collection, filtered);
    });
    res.json({ success: true });
  } catch (err: any) {
    console.error(`[DELETE /api/db/${collection}/${req.params.id}] Error:`, err);
    res.status(errorStatus(err)).json({ error: err.message || 'Failed to delete data' });
  }
}));

export default router;