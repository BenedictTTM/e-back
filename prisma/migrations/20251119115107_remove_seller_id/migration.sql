/*
  Warnings:

  - You are about to drop the column `sellerId` on the `Order` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "public"."Order_sellerId_idx";

-- AlterTable
ALTER TABLE "public"."Order" DROP COLUMN "sellerId";
