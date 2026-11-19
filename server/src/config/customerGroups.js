// Customer groups for the Customer Intelligence module (module 2 only).
//
// On the Customers page each group is shown as an accordion holding its
// member customers; those customers are then left out of the main table so
// nothing is listed twice. Membership is by customer name, matched ignoring
// capitals and extra spaces. To change a group, edit its `members` list.
//
// Some members are names that currently have no orders (e.g. "Falcon Cash &
// Carry", whose orders were renamed to "FALCON CASH & CARRY LTD-2" on
// 2026-11-19). They're kept so that if a re-uploaded or new email brings that
// name back, the order still lands inside the right group.
export const CUSTOMER_GROUPS = [
  {
    id: 'quality',
    name: 'Quality Group',
    members: [
      'Quality Foods (Hayes)',
      'Quality Foods (Southall)',
      'Quality Foods (Hounslow)',
      'Quality Foods (Ilford)',
    ],
  },
  {
    id: 'falcon',
    name: 'Falcon Group',
    members: [
      'Falcon (EM) Limited',
      'FALCON CASH & CARRY LTD-2',
      'FALCON CASH & CARRY LTD',
      'Falcon Cash & Carry', // renamed → LTD-2; kept for future emails
    ],
  },
  {
    id: 'sira',
    name: 'Sira Group',
    members: [
      'Sira Cash & Carry (Surequote) Frozen A/c',
      'Sira Cash & Carry ( South Rd)',
      'Sira Cash & Carry (Surequote Ltd T/A)', // renamed → Frozen A/c; kept for future emails
    ],
  },
];

const nameKey = (name) => String(name ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

const GROUP_BY_MEMBER = new Map();
for (const g of CUSTOMER_GROUPS) {
  for (const m of g.members) GROUP_BY_MEMBER.set(nameKey(m), g);
}

// The group a customer belongs to, or null.
export function groupForCustomer(customerName) {
  return GROUP_BY_MEMBER.get(nameKey(customerName)) || null;
}
