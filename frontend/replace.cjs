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
        } else { 
            if (file.endsWith('.tsx') || file.endsWith('.ts')) {
                results.push(file);
            }
        }
    });
    return results;
}

const files = walk(path.join(__dirname, 'src'));

files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    
    // Check if localhost:8000 exists
    if (content.includes('http://localhost:8000')) {
        let changed = false;
        
        // Add API const if missing
        if (!content.includes('const API = import.meta.env.VITE_API_BASE')) {
            // Find last import
            const importRegex = /import .*? from .*?;?/g;
            let lastMatch;
            let match;
            while ((match = importRegex.exec(content)) !== null) {
                lastMatch = match;
            }
            if (lastMatch) {
                const insertPos = lastMatch.index + lastMatch[0].length;
                content = content.slice(0, insertPos) + "\n\nconst API = import.meta.env.VITE_API_BASE || 'http://localhost:8000';\n" + content.slice(insertPos);
                changed = true;
            } else {
                content = "const API = import.meta.env.VITE_API_BASE || 'http://localhost:8000';\n\n" + content;
                changed = true;
            }
        }

        // Replace single quoted string
        const singleQuoteRegex = /'http:\/\/localhost:8000\/(.*?)'/g;
        if (singleQuoteRegex.test(content)) {
            content = content.replace(singleQuoteRegex, '`${API}/$1`');
            changed = true;
        }

        // Replace double quoted string
        const doubleQuoteRegex = /"http:\/\/localhost:8000\/(.*?)"/g;
        if (doubleQuoteRegex.test(content)) {
            content = content.replace(doubleQuoteRegex, '`${API}/$1`');
            changed = true;
        }

        // Replace backtick string
        const backtickRegex = /`http:\/\/localhost:8000\/(.*?)`/g;
        if (backtickRegex.test(content)) {
            content = content.replace(backtickRegex, '`${API}/$1`');
            changed = true;
        }

        if (changed) {
            fs.writeFileSync(file, content, 'utf8');
            console.log('Fixed:', file);
        }
    }
});
