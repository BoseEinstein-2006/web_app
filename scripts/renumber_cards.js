const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'public', 'cards_ru_categories.json');

try {
  const raw = fs.readFileSync(file, 'utf8');
  const data = JSON.parse(raw);

  const filtered = data.filter((item) => item.id !== 22);
  const renumbered = filtered.map((item, index) => ({ ...item, id: index + 1 }));

  fs.writeFileSync(file, JSON.stringify(renumbered, null, 2) + '\n', 'utf8');
  console.log(`Renumbered ${renumbered.length} items and wrote to ${file}`);
} catch (err) {
  console.error('Error processing file:', err.message);
  process.exit(1);
}
