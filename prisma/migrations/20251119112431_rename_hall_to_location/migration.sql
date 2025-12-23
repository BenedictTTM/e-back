/*
  Warnings:

  - You are about to drop the column `hall` on the `Order` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."Order" DROP COLUMN "hall",
ADD COLUMN     "location" TEXT;
