export const FIXTURES = [
  {
    id: 'abn-tfn-valid',
    text: 'Client ABN is 83 914 571 673 and TFN 123 456 782.',
    expect: { ABN:1, TFN:1 }
  },
  {
    id: 'org-vs-person',
    text: 'Statement issued by Arcadia Wealth Pty Ltd for Mr Daniel O\'Rourke.',
    expect: { ORG:1, PERSON:1 }
  },
  {
    id: 'medicare',
    text: 'Medicare number recorded as 2951 64037 1.',
    expect: { MEDICARE:1 }
  },
  {
    id: 'email-phone-dob',
    text: 'Email daniel@example.com, phone 0412 345 678, DOB 03/11/1984.',
    expect: { EMAIL:1, PHONE:1, DOB:1 }
  }
];
