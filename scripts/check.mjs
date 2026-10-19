import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
for (const name of readdirSync(new URL('../src/', import.meta.url)).filter(name=>name.endsWith('.js')).sort()) {
  const result=spawnSync(process.execPath,['--check',new URL('../src/'+name,import.meta.url).pathname],{stdio:'inherit'});
  if(result.status!==0)process.exit(result.status??1);
}
console.log('All source modules passed syntax checks.');
