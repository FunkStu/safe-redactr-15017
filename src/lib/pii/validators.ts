export const isValidABN = (raw: string): boolean => {
  const abn = raw.replace(/\s+/g, '');
  if (!/^\d{11}$/.test(abn)) return false;
  const w = [10,1,3,5,7,9,11,13,15,17,19];
  const d = abn.split('').map(Number); d[0] -= 1;
  return d.reduce((s,n,i)=>s+n*w[i],0) % 89 === 0;
};

export const isValidTFN = (raw: string): boolean => {
  const s = raw.replace(/\s+/g,'');
  if (!/^\d{8,9}$/.test(s)) return false;
  const w8=[10,7,8,4,6,3,5,2], w9=[1,4,3,7,5,8,6,9,10];
  const w = s.length===9? w9:w8;
  return s.split('').map(Number).reduce((a,n,i)=>a+n*w[i],0) % 11 === 0;
};

export const isValidMedicare = (raw: string): boolean => {
  const s = raw.replace(/\s+/g,'');
  if (!/^\d{10,11}$/.test(s)) return false;
  const w=[1,3,7,9,1,3,7,9];
  const sum = s.slice(0,8).split('').map(Number).reduce((a,n,i)=>a+n*w[i],0);
  return (sum % 10) === Number(s[8]);
};

export const luhnValid = (raw: string): boolean => {
  const s = raw.replace(/\s+/g,'');
  if (!/^\d{12,19}$/.test(s)) return false;
  let sum=0, dbl=false;
  for (let i=s.length-1;i>=0;i--) {
    let d = +s[i];
    if (dbl) { d*=2; if (d>9) d-=9; }
    sum += d; dbl = !dbl;
  }
  return sum % 10 === 0;
};
