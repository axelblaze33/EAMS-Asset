import "server-only";
import QRCode from "qrcode";
import { appUrl } from "@/lib/app-url";

/** SVG QR code that opens the asset's page (sign-in required to view it). */
export async function assetQrSvg(assetId: string) {
  const url = `${await appUrl()}/assets/${assetId}`;
  const svg = await QRCode.toString(url, { type: "svg", errorCorrectionLevel: "M", margin: 0 });
  return { url, svg };
}
