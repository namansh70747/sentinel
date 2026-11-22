import { expect, it } from 'vitest';
import { parseConnector, parseBinding } from './config';
it('validates provider configuration without accepting secrets in public JSON',()=>{
 expect(parseConnector({provider:'loki',name:'Checkout logs',mode:'live',config:{endpoint:'http://loki:3100'}}).provider).toBe('loki');
 expect(()=>parseConnector({provider:'loki',name:'Logs',mode:'live',config:{endpoint:'http://loki:3100',token:'leak'}})).toThrow();
 expect(()=>parseConnector({provider:'loki',name:'Logs',mode:'live',config:{endpoint:'http://user:pass@loki:3100'}})).toThrow();
 expect(()=>parseConnector({provider:'unknown',name:'Bad',mode:'live',config:{}})).toThrow();
 expect(()=>parseConnector({provider:'prometheus',name:'Metrics',mode:'simulated',config:{endpoint:'http://prometheus:9090'}})).toThrow();
});
it('requires explicit provider-specific service mappings',()=>{
 expect(parseBinding('tempo',{serviceName:'checkout-api'})).toEqual({serviceName:'checkout-api'});
 expect(()=>parseBinding('tempo',{serviceName:'',query:'everything'})).toThrow();
 expect(()=>parseBinding('github',{owner:'owner',repo:'../other'})).toThrow();
 expect(()=>parseBinding('loki',{query:'{job="checkout"}',token:'leak'})).toThrow();
});
