// Input: CelesTrak GP JSON, already downloaded from the fixed source.
import fs from 'node:fs';
import {orbitFromGP,DFH1_GP_URL} from '../src/gp-orbit.js';
const source=new URL('../assets/spacecraft/dfh1-gp.json',import.meta.url);
const data=orbitFromGP(JSON.parse(fs.readFileSync(source)),'dfh1',{source:'CelesTrak GP · DFH 1 · SGP4',url:DFH1_GP_URL});
fs.writeFileSync(new URL('../assets/spacecraft/dfh1-orbit.json',import.meta.url),JSON.stringify(data));
console.log({epoch:data.gpEpoch,start:new Date(data.rows[0][0]).toISOString(),end:new Date(data.rows.at(-1)[0]).toISOString(),samples:data.rows.length});
