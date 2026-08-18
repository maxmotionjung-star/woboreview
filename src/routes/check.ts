import { Router } from "express";
import { checkAllProducts, checkSingleProduct } from "../lib/checkProducts";
import { asyncHandler } from "../lib/asyncHandler";

export const checkRouter = Router();

checkRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const { productId } = req.body ?? {};
    if (productId != null) {
      const events = await checkSingleProduct(Number(productId));
      res.json({ ok: true, events });
      return;
    }
    await checkAllProducts();
    res.json({ ok: true });
  })
);
