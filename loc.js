const names = ["Крестовский", "Ярославский", "Хамра", "Мурья", "Салдыкель", "Нюя", "Турукта", "Чапаево", "Мача", "Иннях"];
async function run() {
  for (const n of names) {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(n + " Ленск Якутия")}&format=json`);
    const data = await res.json();
    if (data.length > 0) {
      console.log(`{ id: 's_${n}', name: '${n}', coords: [${parseFloat(data[0].lon).toFixed(2)}, ${parseFloat(data[0].lat).toFixed(2)}] },`);
    } else {
      const res2 = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(n + " Олекминский Якутия")}&format=json`);
      const data2 = await res2.json();
      if (data2.length > 0) {
        console.log(`{ id: 's_${n}', name: '${n}', coords: [${parseFloat(data2[0].lon).toFixed(2)}, ${parseFloat(data2[0].lat).toFixed(2)}] },`);
      } else {
        console.log(`// not found: ${n}`);
      }
    }
  }
}
run();
