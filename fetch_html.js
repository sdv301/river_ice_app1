async function fetchHtml() {
  const res = await fetch('https://frexosm.ru/basin/');
  const html = await res.text();
  console.log(html.substring(0, 2000));
  
  // Extract URLs that look like tile URLs
  const urls = html.match(/https?:\/\/[a-zA-Z0-9.\/-_]*{z}\/[a-zA-Z0-9.\/-_]*/g);
  console.log('Tile URLs:', urls);
  
  // Also look for JS files
  const jsFiles = html.match(/src="([^"]+\.js)"/g);
  console.log('JS Files:', jsFiles);
}
fetchHtml();
