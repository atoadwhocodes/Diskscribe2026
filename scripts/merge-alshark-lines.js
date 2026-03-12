const fs = require('fs');
const path = require('path');
const { getAlsharkPc98Roots } = require('./lib/alshark-roots');

const { paths } = getAlsharkPc98Roots();
const partsDir = paths.allLinesParts;
const outFile = paths.allLinesText;

let files = fs.readdirSync(partsDir).filter(f => /^alshark-lines-\d{1,4}-\d{1,4}\.txt$/.test(f));
files.sort((a,b)=>{
  const num = s => parseInt(s.match(/(\d{1,4})/)[1],10);
  return num(a) - num(b);
});

let out = '';
for(const f of files){
  const p = path.join(partsDir, f);
  let c = fs.readFileSync(p, 'utf8');
  out += c.replace(/\r\n/g,'\n') + '\n';
}
fs.writeFileSync(outFile, out, 'utf8');
console.log(`Merged ${files.length} files into ${outFile}`);
