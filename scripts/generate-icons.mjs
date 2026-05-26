import sharp from "sharp";

const input = "C:/Users/ajoin/Downloads/logo.png";
const BG = { r: 17, g: 17, b: 17, alpha: 1 }; // #111111

async function makeIcon(size, outPath) {
  const logoSize = Math.round(size * 0.72);

  const logo = await sharp(input)
    .resize(logoSize, logoSize, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .png()
    .toBuffer();

  await sharp({
    create: { width: size, height: size, channels: 4, background: BG },
  })
    .composite([{ input: logo, gravity: "center" }])
    .png()
    .toFile(outPath);

  console.log(`wrote ${outPath}`);
}

await makeIcon(512, "public/icons/icon-512.png");
await makeIcon(192, "public/icons/icon-192.png");
await makeIcon(180, "public/apple-touch-icon.png");
await makeIcon(512, "public/logo.png");
await makeIcon(512, "app/icon.png");
