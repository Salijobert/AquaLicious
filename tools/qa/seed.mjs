import {prisma,record} from './common.mjs';
for(const [name,role,verified,consent] of [['admin','ADMIN',false,true],['alice','CUSTOMER',true,true],['bob','CUSTOMER',true,true],['unverified','CUSTOMER',false,true],['no-consent','CUSTOMER',true,false]]){
 const u=await prisma.user.upsert({where:{username:'qa-'+name},update:{},create:{username:'qa-'+name,name:'QA '+name,email:name+'@example.invalid',firebaseUid:'qa-'+name,role,emailVerified:verified}});
 if(consent&&!await prisma.userConsent.count({where:{userId:u.id}}))await prisma.userConsent.create({data:{userId:u.id,termsVersion:'qa-v1'}});
}
const admin=await prisma.user.findUnique({where:{username:'qa-admin'}});
const category=await prisma.category.upsert({where:{name:'QA water'},update:{},create:{name:'QA water'}});
for(const [sku,stock] of [['QA-WATER',50],['QA-LAST',3],['QA-ZERO',0]]){
 const p=await prisma.product.upsert({where:{sku},update:{},create:{sku,name:sku,categoryId:category.id,sellingPrice:30,productionCost:10,stock,volumeLabel:'5 Gallon'}});
 if(!await prisma.stockMovement.count({where:{productId:p.id}}))await prisma.stockMovement.create({data:{productId:p.id,userId:admin.id,movementType:'RESTOCK',quantityChange:stock,previousBalance:0,newBalance:stock,notes:'QA opening balance'}});
}
record('0.3','PASS','Seed isolated realistic users, consent states, products and opening ledger',JSON.stringify({users:await prisma.user.count(),consents:await prisma.userConsent.count(),products:await prisma.product.count(),ledger:await prisma.stockMovement.count(),orders:await prisma.salesOrder.count()})+'; order fixtures added in checkout phase');
await prisma.$disconnect();
