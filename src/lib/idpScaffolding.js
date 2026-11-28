export const starters=[
  {id:'static-site@1',name:'Static website',description:'HTML, CSS and JavaScript. No build dependencies.'},
  {id:'node-api@1',name:'Node HTTP API',description:'JSON endpoints, health check and a Node test. No framework dependency.'}
];

export function scaffold(slug,template,description='') {
  if(!/^[a-z][a-z0-9-]{2,47}$/.test(slug)||!starters.some(row=>row.id===template))
    throw Error('Choose a template and a 3–48 character lowercase project slug.');

  if(description.length>3000)throw Error('Description is too long.');

  const json=value=>JSON.stringify(value,null,2)+'\n';

  const files={
    'README.md':'# '+slug+'\n\n'+description+'\n\n'+(
      template==='node-api@1'
        ?'Requires Node 22 or newer.\n\nRun `npm test`, then `npm start`. Open http://localhost:3000/health.'
        :'Open index.html in a browser. For Render use build command `echo No build step` and publish directory `.`.'
    )+'\n',
    'catalog-info.yaml':'apiVersion: backstage.io/v1alpha1\nkind: Component\nmetadata:\n  name: '+slug+'\nspec:\n  type: '+(
      template==='node-api@1'?'service':'website'
    )+'\n  lifecycle: experimental\n  owner: user:default/replace-with-owner\n',
    '.gitignore':'node_modules/\n.env\n.env.*\n!.env.example\n'
  };

  if(template==='static-site@1') {
    Object.assign(files,{
      'index.html':'<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+slug+'</title><link rel="stylesheet" href="style.css"></head><body><main><h1>'+slug+'</h1><p>Your TechDev starter is ready.</p><button id="hello">Say hello</button><p id="message" aria-live="polite"></p></main><script src="app.js"></script></body></html>\n',
      'style.css':'body{margin:0;background:#174b31;color:#173b29;font:18px system-ui;padding:8vw}main{max-width:800px;margin:auto;padding:32px;background:#fff;border-radius:20px}button{background:#ffb763;color:#432607;border:0;border-radius:10px;padding:12px 20px;font:inherit}\n',
      'app.js':'document.querySelector("#hello").addEventListener("click",()=>{document.querySelector("#message").textContent="Empower your digital journey";});\n'
    });
  } else {
    Object.assign(files,{
      'package.json':json({
        name:slug,version:'0.1.0',private:true,type:'module',
        engines:{node:'>=22'},
        scripts:{start:'node server.js',test:'node --test'}
      }),
      'app.js':'export function handle(request,response){response.setHeader("Content-Type","application/json");if(request.method!=="GET"){response.writeHead(405,{Allow:"GET"});return response.end(JSON.stringify({error:"Method not allowed"}));}if(request.url==="/health"){return response.end(JSON.stringify({ok:true}));}response.statusCode=404;response.end(JSON.stringify({error:"Not found"}));}\n',
      'server.js':'import {createServer} from "node:http";\nimport {handle} from "./app.js";\ncreateServer(handle).listen(Number(process.env.PORT||3000),"0.0.0.0");\n',
      'app.test.js':'import test from "node:test";\nimport assert from "node:assert/strict";\nimport {handle} from "./app.js";\ntest("health endpoint returns JSON",()=>{let body;const headers={};handle({method:"GET",url:"/health"},{setHeader:(k,v)=>headers[k]=v,end:value=>body=value});assert.equal(headers["Content-Type"],"application/json");assert.deepEqual(JSON.parse(body),{ok:true});});\n'
    });
  }

  return files;
}

export function projectZip(slug,files) {
  if(!/^[a-z][a-z0-9-]{2,47}$/.test(slug))throw Error('Invalid project slug.');

  const encoder=new TextEncoder(),local=[],central=[];
  let offset=0;

  const crc=bytes=>{
    let n=0xffffffff;
    for(const b of bytes){
      n^=b;
      for(let i=0;i<8;i++)n=(n>>>1)^((n&1)?0xedb88320:0);
    }
    return(n^0xffffffff)>>>0;
  };

  const header=(size,values)=>{
    const bytes=new Uint8Array(size),view=new DataView(bytes.buffer);
    for(const [at,value,bits=32]of values)
      view[bits===16?'setUint16':'setUint32'](at,value,true);
    return bytes;
  };

  for(const [path,content]of Object.entries(files)) {
    if(!/^[a-zA-Z0-9_.-]+$/.test(path)||path==='..')
      throw Error('Invalid generated file path.');

    const name=encoder.encode(slug+'/'+path);
    const data=encoder.encode(content),sum=crc(data);

    const h=header(30,[
      [0,0x04034b50],[4,20,16],[6,0x800,16],[12,33,16],
      [14,sum],[18,data.length],[22,data.length],[26,name.length,16]
    ]);

    local.push(h,name,data);

    central.push(header(46,[
      [0,0x02014b50],[4,20,16],[6,20,16],[8,0x800,16],
      [14,33,16],[16,sum],[20,data.length],[24,data.length],
      [28,name.length,16],[42,offset]
    ]),name);

    offset+=h.length+name.length+data.length;
  }

  const size=central.reduce((n,item)=>n+item.length,0);
  const count=Object.keys(files).length;

  const chunks=[
    ...local,...central,
    header(22,[
      [0,0x06054b50],[8,count,16],[10,count,16],[12,size],[16,offset]
    ])
  ];

  const output=new Uint8Array(chunks.reduce((n,item)=>n+item.length,0));
  let at=0;
  for(const chunk of chunks){output.set(chunk,at);at+=chunk.length;}
  return output;
}

export function downloadProject(slug,files) {
  const url=URL.createObjectURL(
    new Blob([projectZip(slug,files)],{type:'application/zip'})
  );
  const link=document.createElement('a');
  link.href=url;
  link.download=slug+'.zip';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
}
