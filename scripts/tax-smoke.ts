import { applyTransferTax, applyCollectTax, formatTaxStatus, taxLine, applyPurchaseFee, applyContractTax } from '../src/game/tax.ts';
import { BUSINESS_CATALOG } from '../src/game/businesses.ts';
import fs from 'fs';

// catalog integrity: unique ids, correct count
const ids = BUSINESS_CATALOG.map(b => b.id);
const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
console.log(`catalog size: ${ids.length} (dupes: ${dupes.length ? dupes.join(',') : 'none'})`);

const mk = (o: any = {}) => ({ id: '999999', cash: 1000000, bank: 0, isAdmin: false, businesses: [], ...o });
const p = mk({});
console.log('collect 20k  (2 biz)   ->', JSON.stringify(applyCollectTax(mk({ businesses: ['a', 'b'] }), 20000))); // 35%
console.log('collect 50k  (2 biz)   ->', JSON.stringify(applyCollectTax(p, 50000))); // 40%
console.log('collect 100k (8 biz)   ->', JSON.stringify(applyCollectTax(mk({ businesses: ['1','2','3','4','5','6','7','8'] }), 100000))); // 45% + 10% surcharge = 55%
console.log('collect 200k (20 biz)  ->', JSON.stringify(applyCollectTax(mk({ businesses: Array.from({length: 20}, (_, i) => String(i)) }), 200000))); // 50% + 10% = 60% cap
console.log('collect 50k admin      ->', JSON.stringify(applyCollectTax(mk({ isAdmin: true }), 50000)));
console.log('biz buy fee 100k       ->', JSON.stringify(applyPurchaseFee(p, 100000))); // 5%
console.log('contract 5000          ->', JSON.stringify(applyContractTax(p, 5000))); // 10%
console.log('--- .tax output ---');
console.log(formatTaxStatus(p));
console.log('menu image exists:', fs.existsSync('assets/images.jpg'));

