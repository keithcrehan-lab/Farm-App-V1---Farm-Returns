import { describe, expect, it } from 'vitest';
import { validDate, validateDeliveryInput, validateOrderInput } from './order-forms';
const today='2026-11-07';
const order={productGtin:'4006381333931',supplierName:'Supplier',supplierReference:'PO-1',orderedKg:1000,confirmedDate:today,confirmationSource:'Signed purchase order'};
const delivery={orderId:'id',productGtin:order.productGtin,receivedKg:300,deliveryReference:'D-1',receivedDate:today};
describe('camera purchase and delivery input',()=>{
 it('requires a real date',()=>{expect(validDate('2026-02-30',today)).toBe(false);expect(validDate(today,today)).toBe(true);});
 it('rejects unchecked order and delivery amounts',()=>{expect(validateOrderInput(order,today)).toBeNull();expect(validateOrderInput({...order,orderedKg:NaN},today)).not.toBeNull();expect(validateDeliveryInput(delivery,today)).toBeNull();expect(validateDeliveryInput({...delivery,receivedKg:-1},today)).not.toBeNull();});
 it('requires evidence of the accepted order',()=>{expect(validateOrderInput({...order,confirmationSource:''},today)).not.toBeNull();expect(validateDeliveryInput({...delivery,deliveryReference:''},today)).not.toBeNull();});
});
