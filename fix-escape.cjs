const fs = require('fs');
const content = fs.readFileSync('scripts/make-paper-tables.ts', 'utf8');
let newContent = content;
while (newContent.includes(".replace(/</g, '<')")) {
  newContent = newContent.replace(".replace(/</g, '<')", ".replace(/</g, '<')");
}
while (newContent.includes(".replace(/>/g, '>')")) {
  newContent = newContent.replace(".replace(/>/g, '>')", ".replace(/>/g, '>')");
}
fs.writeFileSync('scripts/make-paper-tables.ts', newContent);
console.log('Done');