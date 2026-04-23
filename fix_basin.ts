import fs from 'fs';

async function run() {
  const res = await fetch('https://frexosm.ru/mb-styles/river_basin.style');
  const style = await res.json();
  for(let key in style.sources) {
      if(style.sources[key].url && style.sources[key].url.startsWith('/tiles')) {
        style.sources[key].url = 'https://frexosm.ru' + style.sources[key].url;
      }
  }
  if (style.sprite) style.sprite = 'https://frexosm.ru' + style.sprite;
  if (style.glyphs) style.glyphs = 'https://frexosm.ru' + style.glyphs;
  
  fs.writeFileSync('src/utils/frexosm_basin_style.json', JSON.stringify(style, null, 2));
  console.log('Saved corrected basin style');
}
run();
