const fs = require('fs');
const path = require('path');

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) {
            results = results.concat(walk(file));
        } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
            results.push(file);
        }
    });
    return results;
}

const files = walk('C:/Coding/_worktrees/2ndB-antigravity/src');
let changed = 0;

files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    let original = content;
    
    content = content.replace(/marginLeft/g, 'marginStart');
    content = content.replace(/marginRight/g, 'marginEnd');
    content = content.replace(/paddingLeft/g, 'paddingStart');
    content = content.replace(/paddingRight/g, 'paddingEnd');
    content = content.replace(/borderLeftWidth/g, 'borderStartWidth');
    content = content.replace(/borderLeftColor/g, 'borderStartColor');
    content = content.replace(/borderRightWidth/g, 'borderEndWidth');
    content = content.replace(/borderRightColor/g, 'borderEndColor');
    
    if (content !== original) {
        fs.writeFileSync(file, content, 'utf8');
        changed++;
        console.log('Updated ' + file);
    }
});

console.log('Total files updated: ' + changed);
