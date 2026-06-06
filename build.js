const fs = require('fs');
const path = require('path');

console.log('Starting build process...');

// 1. Create public directory if not exists
const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir);
}

// 2. Copy all HTML, JS, CSS files and images folder to public
const files = fs.readdirSync(__dirname);
files.forEach(file => {
    if (file === 'public' || file === 'node_modules' || file.startsWith('.')) {
        return;
    }
    
    const srcPath = path.join(__dirname, file);
    const destPath = path.join(publicDir, file);
    const stat = fs.statSync(srcPath);
    
    if (stat.isDirectory()) {
        if (file === 'images') {
            copyFolderSync(srcPath, destPath);
        }
    } else {
        const ext = path.extname(file).toLowerCase();
        if (['.html', '.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.svg'].includes(ext)) {
            fs.copyFileSync(srcPath, destPath);
            console.log(`Copied: ${file}`);
        }
    }
});

// 3. Create config.js inside public
const configContent = `const CONFIG = {
    SUPABASE_URL: '${process.env.SUPABASE_URL || ''}',
    SUPABASE_KEY: '${process.env.SUPABASE_KEY || ''}',
    GEMINI_API_KEY: '${process.env.GEMINI_API_KEY || ''}'
};
`;
fs.writeFileSync(path.join(publicDir, 'config.js'), configContent);
console.log('Generated config.js with environment variables.');

console.log('Build completed successfully!');

function copyFolderSync(from, to) {
    if (!fs.existsSync(to)) {
        fs.mkdirSync(to, { recursive: true });
    }
    fs.readdirSync(from).forEach(element => {
        const srcElement = path.join(from, element);
        const destElement = path.join(to, element);
        const stat = fs.lstatSync(srcElement);
        if (stat.isFile()) {
            fs.copyFileSync(srcElement, destElement);
        } else if (stat.isDirectory()) {
            copyFolderSync(srcElement, destElement);
        }
    });
}
