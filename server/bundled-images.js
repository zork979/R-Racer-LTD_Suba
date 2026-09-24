const originals = [
  ["mustang-front", "Ford Mustang · front", "cars2-1.jpg"],
  ["prius-front", "Toyota Prius · front", "hero-1.jpeg"],
  ["rav4", "Toyota RAV4", "listing-1-1.jpg"],
  ["audi-a1", "Audi A1", "listing-1-6.jpg"],
  ["prius-rear", "Toyota Prius · rear", "hero-2.jpeg"],
  ["camaro", "Chevrolet Camaro", "listing-1-4.jpg"],
  ["kia-soul", "Kia Soul", "listing-1-2.jpg"],
  ["mustang-side", "Ford Mustang · side", "cars2-2.jpg"],
  ["mustang-rear", "Ford Mustang · rear", "cars2-3.jpg"],
];
export const bundledImages = originals.map(([key, label, file]) => ({
  key, label, url: `/media/${file}`, thumbnail: `/media/${file}`,
}));
const replacements = Object.fromEntries(originals.flatMap(([key, , file]) => [
  [`${key}.webp`, file], [`${key}-768.webp`, file],
]));
// Restore known bundled URLs only. Keep image IDs, gallery order and uploads.
export async function refreshBundledImages(db) {
  for (const image of await db.find("images")) {
    const name =
      typeof image.url === "string" && image.url.startsWith("/media/")
        ? image.url.slice(7)
        : "";
    if (replacements[name])
      await db.update("images", image._id, {
        url: "/media/" + replacements[name],
      });
  }
}
