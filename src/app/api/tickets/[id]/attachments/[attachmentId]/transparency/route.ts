import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { ticketAttachments } from "@/db/schema";
import { eq } from "drizzle-orm";
import sharp from "sharp";

// POST /api/tickets/[id]/attachments/[attachmentId]/transparency - Update attachment with processed image
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; attachmentId: string }> }
) {
  try {
    const { id, attachmentId } = await params;

    // Get the attachment to verify it exists
    const attachment = await db
      .select()
      .from(ticketAttachments)
      .where(eq(ticketAttachments.id, parseInt(attachmentId)))
      .get();

    if (!attachment || attachment.ticketId !== id) {
      return NextResponse.json(
        { error: "Attachment not found" },
        { status: 404 }
      );
    }

    // Get the request body
    const body = await request.json().catch(() => ({}));
    const { processedDataUrl, tolerance = 50, greyTarget = 128 } = body;

    let finalDataUrl: string;

    if (processedDataUrl) {
      // Use provided processed image
      finalDataUrl = processedDataUrl;
    } else {
      // Process image server-side using sharp
      if (!attachment.data) {
        return NextResponse.json(
          { error: "Attachment has no image data" },
          { status: 400 }
        );
      }

      // Extract base64 data from data URL
      const base64Data = attachment.data.replace(/^data:image\/\w+;base64,/, "");
      const imageBuffer = Buffer.from(base64Data, "base64");

      // Load image with sharp
      const image = sharp(imageBuffer);
      const { width, height } = await image.metadata();

      if (!width || !height) {
        return NextResponse.json(
          { error: "Unable to read image dimensions" },
          { status: 400 }
        );
      }

      // Get raw pixel data
      const { data: pixelData } = await image
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

      let pixelsChanged = 0;

      // Process pixels: make 50% grey transparent
      for (let i = 0; i < pixelData.length; i += 4) {
        const r = pixelData[i];
        const g = pixelData[i + 1];
        const b = pixelData[i + 2];

        // Check if pixel is close to 50% grey
        const isGrey =
          Math.abs(r - greyTarget) < tolerance &&
          Math.abs(g - greyTarget) < tolerance &&
          Math.abs(b - greyTarget) < tolerance &&
          Math.abs(r - g) < tolerance &&
          Math.abs(g - b) < tolerance;

        if (isGrey) {
          // Make it transparent
          pixelData[i + 3] = 0;
          pixelsChanged++;
        }
      }

      console.log(`Made ${pixelsChanged} pixels transparent`);

      // Create PNG from modified pixel data
      const processedBuffer = await sharp(pixelData, {
        raw: {
          width,
          height,
          channels: 4,
        },
      })
        .png()
        .toBuffer();

      // Convert to data URL
      finalDataUrl = `data:image/png;base64,${processedBuffer.toString("base64")}`;
    }

    // Update the attachment with the processed image
    await db
      .update(ticketAttachments)
      .set({
        data: finalDataUrl,
        mimeType: "image/png",
        updatedAt: new Date().toISOString(),
      })
      .where(eq(ticketAttachments.id, parseInt(attachmentId)))
      .run();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating attachment:", error);
    return NextResponse.json(
      { error: "Failed to update attachment" },
      { status: 500 }
    );
  }
}
