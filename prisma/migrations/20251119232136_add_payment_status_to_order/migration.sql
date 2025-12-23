-- AlterTable
ALTER TABLE "public"."Order" ADD COLUMN     "paymentStatus" TEXT NOT NULL DEFAULT 'UNPAID';

-- AlterTable
ALTER TABLE "public"."Payment" ADD COLUMN     "orderId" INTEGER;

-- CreateIndex
CREATE INDEX "Payment_orderId_idx" ON "public"."Payment"("orderId");

-- AddForeignKey
ALTER TABLE "public"."Payment" ADD CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "public"."Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
