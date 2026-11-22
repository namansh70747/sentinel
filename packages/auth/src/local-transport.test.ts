import { expect, it } from 'vitest';
import { localOidcTransport } from './local-transport';
it('rewrites only dedicated local realm transport while preserving discovery content', async () => {
 const calls: string[] = [];
 const transport = localOidcTransport('http://localhost:8088/realms/sentinel', 'http://keycloak:8080', async input => {
  calls.push(String(input));
  return Response.json({issuer:'http://localhost:8088/realms/sentinel'});
 });
 const options = {method:'GET',headers:{},redirect:'manual' as const,body:undefined};
 expect(await (await transport('http://localhost:8088/realms/sentinel/.well-known/openid-configuration',options)).json()).toEqual({issuer:'http://localhost:8088/realms/sentinel'});
 expect(calls).toEqual(['http://keycloak:8080/realms/sentinel/.well-known/openid-configuration']);
 await expect(transport('http://localhost:8088/admin',options)).rejects.toThrow();
 await expect(transport('https://other.example/realms/sentinel/token',options)).rejects.toThrow();
 expect(()=>localOidcTransport('https://company.example','http://keycloak:8080')).toThrow();
 expect(()=>localOidcTransport('http://localhost:8088/realms/sentinel','http://attacker.example')).toThrow();
});
