const fs = require('fs');
const path = require('path');
function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(function(file) {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
      const content = fs.readFileSync(file, 'utf8');
      const matches = content.match(/require\(['"`][^'"`]*assets[^'"`]*['"`]\)/g);
      if (matches) {
        matches.forEach(m => results.push(file + ': ' + m));
      }
    }
  });
  return results;
}
console.log(walk('src').join('\n'));
