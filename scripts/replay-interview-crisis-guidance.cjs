// Offline replay of fixed synthetic outputs; all network calls are forbidden.
const path=require('node:path');
const root=path.resolve(__dirname,'..');
require(root+'/node_modules/tsx/dist/cjs/index.cjs');
const fs=require('node:fs'),ts=require(root+'/node_modules/typescript'),assert=require('node:assert/strict');
global.fetch=()=>{throw Error('Network forbidden in review')};process.env.EXPO_PUBLIC_SERVER_SAFETY='false';
const parse=file=>ts.createSourceFile(file,fs.readFileSync(root+'/'+file,'utf8'),ts.ScriptTarget.Latest,true,file.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
function find(ast,test){const all=[];function visit(n){if(test(n))all.push(n);ts.forEachChild(n,visit)}visit(ast);assert.equal(all.length,1);return all[0]}
function declarations(ast,names){return names.map(name=>find(ast,n=>ts.isFunctionDeclaration(n)&&n.name?.text===name).getText(ast).replace(/^export\s+/,'' )).join('\n')}
function evaluate(code,scope,ret){const js=ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;return new Function(...Object.keys(scope),js+'\nreturn '+ret)(...Object.values(scope))}
const classifier=require(root+'/src/lib/safety/classifier.ts'), emergency=require(root+'/src/lib/safety/emergency-routing.ts');
const stuck=require(root+'/src/lib/interview/stuck.ts'),continuity=require(root+'/src/lib/interview/continuity.ts');
const safetyAst=parse('src/lib/llm/safety.ts');
const safety=evaluate('let cachedClient=null;const ROUTING_TEMPLATE_VERSION="rcv1-2026-05-25";'+declarations(safetyAst,['getFlashClient','lexiconToResult','mergeResults','classifyViaProxy','classifySafety','fixedCrisisResponse']),{
 getEnv:()=>({EXPO_PUBLIC_LLM_MODE:'live',EXPO_PUBLIC_USE_VERTEX:false}),lexiconClassify:classifier.classifyInput,...emergency,crisisHotlines:classifier.crisisHotlines,noteSemanticUnavailable:()=>{},
},'({classifySafety,fixedCrisisResponse})');
const boundaryAst=parse('src/lib/llm/boundary.ts'),callNode=find(boundaryAst,n=>ts.isFunctionDeclaration(n)&&n.name?.text==='callLlm');
const start=callNode.body.statements.findIndex(n=>ts.isVariableStatement(n)&&n.declarationList.declarations.some(x=>x.name.getText(boundaryAst)==='lexical'));assert(start>=0);
const boundaryTail=callNode.body.statements.slice(start).map(n=>n.getText(boundaryAst)).join('\n');
const replayBoundary=evaluate(`async function replay(text,input){const promptHash='local';const latencyMs=0;const modelUsedForAudit='recorded';const vertexBackend=false;const effort='low';const servedByProvider='openai';const proxyAudited=true;const fence=()=>{};${boundaryTail}}`,{
 classifyInput:classifier.classifyInput,...safety,writeAiAuditLog:async()=>{},writeCrisisEvent:async()=>{},replySwapCategories:()=>[],djb2:()=> 'local-only-hash'
},'replay');
const runner=parse('scripts/eval-interview-crisis-guidance.ts');
const corpusNode=find(runner,n=>ts.isVariableDeclaration(n)&&n.name.getText(runner)==='corpus').initializer;
const corpus=evaluate('const corpus='+corpusNode.getText(runner),{},'corpus');
const probeAst=parse('src/lib/interview/probe.ts');let currentRaw;
const probe=evaluate(probeAst.statements.filter(n=>!ts.isImportDeclaration(n)).map(n=>n.getText(probeAst)).join('\n'),{
 exports:{},callLlm:input=>replayBoundary(currentRaw,input),...require(root+'/src/lib/interview/loop-check.ts'),...require(root+'/src/lib/llm/untrusted.ts'),...stuck,...continuity
},'exports');
const screen=parse('src/app/interview.tsx');
const askNode=find(screen,n=>ts.isVariableDeclaration(n)&&n.name.getText(screen)==='ask').initializer.arguments[0];
const recorded=JSON.parse(fs.readFileSync(root+'/docs/handoff/T23-INTERVIEW-GUIDANCE-RESPONSES-261015.json','utf8'));
(async()=>{
 const results=[];
 for(const r of recorded){
  const c=corpus.cases.find(c=>c.id===r.id);currentRaw=r.text;
  const parsed=JSON.parse(r.text);const history=[{role:'interviewer',text:c.prior,layer:'fact',period:'work',sceneStart:true},{role:'user',text:c.text,layer:'fact',period:'work'}];
  const cov=probe.emptyCoverage();let visible=[],guide=null,finished=false,lastProbe;
  const scope={userId:'review',period:'work',locale:c.locale,isMinor:c.minor,concreteOnly:false,ended:{current:false},mounted:{current:true},captureAccountOwnerLease:()=>({isCurrent:()=>true}),nextMove:probe.nextMove,entriesOf:()=>[],nextProbe:async(...args)=>(lastProbe=await probe.nextProbe(...args)),hotlineFor:()=>c.locale==='ko'?(c.minor?'KR_1388':'KR_109'):'GLOBAL_988',t:key=>key,publishCrisisNotice:(_owner,id)=>{guide=id},finish:()=>{finished=true},...continuity,...stuck,incrementCoverage:probe.incrementCoverage,setTurns:rows=>{visible=rows},setBusy:()=>{},setNotice:()=>{},setPendingLayer:()=>{},setOpeners:()=>{},setCoverage:()=>{},setStuckStreak:()=>{},readDayLimitRefusal:async()=>false,INTERVIEW_PURPOSE:'interview_probe'};
  const ask=evaluate('const ask='+askNode.getText(screen),scope,'ask');
  assert(continuity.canCreditAnswer(c.text,'fact',c.locale));
  await ask(history,cov,null,[],'fact');assert(lastProbe,'actual nextProbe ran');
  const last=visible.at(-1)?.text??'';
  const sem=await safety.classifySafety(r.text,c.locale);
  results.push({id:r.id,arm:r.arm,inputZone:classifier.classifyInputAnyLocale(c.text,c.locale,{minor:c.minor}).zone,rawQuestionLength:parsed.question.length,lexicalZone:classifier.classifyInput(r.text,c.locale,{minor:c.minor}).zone,offlineClassifySafetyZone:sem.zone,probeZone:lastProbe.zone,answeredLayer:lastProbe.answeredLayer??'none',questionReplaced:lastProbe.question!==parsed.question,questionNumbers:lastProbe.question.match(/\b(?:109|119|112|1388|988|911)\b/g)??[],screenGuidance:guide,screenFixedScaffold:last===stuck.scaffoldQuestion('fact',c.locale,1),screenRawQuestion:last===parsed.question,screenNumbers:last.match(/\b(?:109|119|112|1388|988|911)\b/g)??[],finished});
 }
 const output=process.argv.find(x=>x.startsWith('--out='))?.slice(6);
 if(output) fs.writeFileSync(output,JSON.stringify(results,null,2)+'\n');
 console.log(JSON.stringify(results,null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
