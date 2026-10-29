import {prisma,request,token} from './common.mjs';
const admin=await prisma.user.findUnique({where:{id:1}});await prisma.user.updateMany({where:{role:'ADMIN',id:{not:1}},data:{role:'CUSTOMER'}});await prisma.user.update({where:{id:1},data:{username:'test-owner',firebaseUid:process.env.ADMIN_FIREBASE_UID||'qa-admin',role:'ADMIN',active:true}});
for(const [id,price] of [[1,30],[2,250]]){await prisma.product.update({where:{id},data:{sellingPrice:price,productionCost:10,active:true}});await request('/api/inventory',{method:'POST',token:token(admin),body:{product_id:id,type:'ADJUSTMENT',quantity:100,notes:'QA existing suite fixture reset'}});}
await prisma.$disconnect();
