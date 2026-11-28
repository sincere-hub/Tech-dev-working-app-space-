export function folder(value='') {
 if(typeof value!=='string'||value.length>120||
  !/^[\w./-]*$/.test(value)||
  /(^\/|(^|\/)\.\.?(\/|$))/.test(value))
  throw Error('Invalid project folder.');
 return value.replace(/\/$/,'');
}

export function detectProject(files,pkg={},descriptor={}) {
 const deps={...pkg.dependencies,...pkg.devDependencies};
 const build=typeof pkg.scripts?.build==='string';
 const install=files.has('pnpm-lock.yaml')
  ?'corepack enable && pnpm install --frozen-lockfile && pnpm run build'
  :files.has('yarn.lock')
   ?'corepack enable && yarn install --immutable && yarn build'
   :files.has('package-lock.json')
    ?'npm ci && npm run build'
    :'npm install && npm run build';

 const server=Boolean(
  deps.next||deps.express||deps.fastify||deps['@nestjs/core']
 );

 let result={
  runtime:server?'server':'static',
  kind:server?'api':'website',
  build_command:build?install:'',
  publish_dir:''
 };

 if(build&&deps.vite)result.publish_dir='dist';
 else if(build&&deps['react-scripts'])result.publish_dir='build';
 else if(!files.has('package.json')&&files.has('index.html')){
  result={
   runtime:'static',kind:'website',
   build_command:'echo Static site',publish_dir:'.'
  };
 }

 for(const key of ['runtime','kind','build_command','publish_dir']){
  if(typeof descriptor[key]==='string')result[key]=descriptor[key];
 }
 return result;
}

export function validateProject(config) {
 if(!['static','server'].includes(config.runtime)||
  !['website','api','worker'].includes(config.kind))
  throw Error('Choose the project runtime and service type.');

 if(typeof config.build_command!=='string'||
  !config.build_command.trim()||
  config.build_command.length>500||
  /[\r\n\0]/.test(config.build_command))
  throw Error('Enter the preview build command under Advanced settings.');

 if(typeof config.publish_dir!=='string'||
  !/^[\w./-]{1,120}$/.test(config.publish_dir)||
  /(^\/|(^|\/)\.\.(\/|$))/.test(config.publish_dir))
  throw Error('Enter a relative publish directory under Advanced settings.');

 return {...config,root_dir:folder(config.root_dir)};
}

export function matchingTemplate(repo,job) {
 return repo?.full_name?.toLowerCase()===
  (job.owner_name+'/'+job.name).toLowerCase()&&
  repo.private===true&&
  repo.template_repository?.full_name?.toLowerCase()===
   job.template.toLowerCase()&&
  Date.parse(repo.created_at)>=Date.parse(job.created_at)-1000;
}
