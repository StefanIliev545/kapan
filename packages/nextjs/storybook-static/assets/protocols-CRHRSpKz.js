import{r as y}from"./index-Bk_d_yAU.js";import{s as j,d as Ae}from"./createSafeContext-Dp97sAkz.js";import{u as K}from"./store-CUKCto7f.js";import{C as Se,F as xe,z as g,T as A}from"./en_US-YBXRRIY6-ByhZuFgc.js";import{c as Fe,C as E}from"./contract-CleVho0y.js";import{o as ge,s as Be,g as ke,h as be,t as Ve}from"./SelectedGasTokenContext-BLwdQCB-.js";import{u as se,s as ue,b as N,a as G,c as pe,d as te,e as we,f as _e}from"./Constants-BRuV1-4o.js";import{j as D}from"./jsx-runtime-CcWEvojh.js";import{a as J}from"./networks-DgHYYcb8.js";import{c as Y,g as qe}from"./_commonjsHelpers-CE1G-McA.js";const L={log:(...e)=>{},warn:(...e)=>{},error:(...e)=>{console.error(...e)},info:(...e)=>{},debug:(...e)=>{}};var ae,me;function Ne(){if(me)return ae;me=1;var e="Expected a function",t=NaN,r="[object Symbol]",n=/^\s+|\s+$/g,a=/^[-+]0x[0-9a-f]+$/i,i=/^0b[01]+$/i,s=/^0o[0-7]+$/i,c=parseInt,p=typeof Y=="object"&&Y&&Y.Object===Object&&Y,m=typeof self=="object"&&self&&self.Object===Object&&self,f=p||m||Function("return this")(),d=Object.prototype,P=d.toString,k=Math.max,b=Math.min,u=function(){return f.Date.now()};function S(o,l,v){var I,H,W,q,C,w,O=0,oe=!1,M=!1,Q=!0;if(typeof o!="function")throw new TypeError(e);l=V(l)||0,x(v)&&(oe=!!v.leading,M="maxWait"in v,W=M?k(V(v.maxWait)||0,l):W,Q="trailing"in v?!!v.trailing:Q);function Z(h){var T=I,U=H;return I=H=void 0,O=h,q=o.apply(U,T),q}function Pe(h){return O=h,C=setTimeout($,l),oe?Z(h):q}function Ie(h){var T=h-w,U=h-O,de=l-T;return M?b(de,W-U):de}function ce(h){var T=h-w,U=h-O;return w===void 0||T>=l||T<0||M&&U>=W}function $(){var h=u();if(ce(h))return le(h);C=setTimeout($,Ie(h))}function le(h){return C=void 0,Q&&I?Z(h):(I=H=void 0,q)}function Te(){C!==void 0&&clearTimeout(C),O=0,I=w=H=C=void 0}function Ee(){return C===void 0?q:le(u())}function ee(){var h=u(),T=ce(h);if(I=arguments,H=this,w=h,T){if(C===void 0)return Pe(w);if(M)return C=setTimeout($,l),Z(w)}return C===void 0&&(C=setTimeout($,l)),q}return ee.cancel=Te,ee.flush=Ee,ee}function x(o){var l=typeof o;return!!o&&(l=="object"||l=="function")}function F(o){return!!o&&typeof o=="object"}function B(o){return typeof o=="symbol"||F(o)&&P.call(o)==r}function V(o){if(typeof o=="number")return o;if(B(o))return t;if(x(o)){var l=typeof o.valueOf=="function"?o.valueOf():o;o=x(l)?l+"":l}if(typeof o!="string")return o===0?o:+o;o=o.replace(n,"");var v=i.test(o);return v||s.test(o)?c(o.slice(2),v?2:8):a.test(o)?t:+o}return ae=S,ae}var Re=Ne();const fe=qe(Re);var He=typeof window<"u"?y.useLayoutEffect:y.useEffect;function Oe(e,t){const r=y.useRef(e);He(()=>{r.current=e},[e]),y.useEffect(()=>{if(t===null)return;const n=setInterval(()=>{r.current()},t);return()=>{clearInterval(n)}},[t])}function Me(e){const t=y.useRef(e);t.current=e,y.useEffect(()=>()=>{t.current()},[])}function Ue(e,t=500,r){const n=y.useRef();Me(()=>{n.current&&n.current.cancel()});const a=y.useMemo(()=>{const i=fe(e,t,r),s=(...c)=>i(...c);return s.cancel=()=>{i.cancel()},s.isPending=()=>!!n.current,s.flush=()=>i.flush(),s},[e,t,r]);return y.useEffect(()=>{n.current=fe(e,t,r)},[e,t,r]),a}function ot(e,t,r){const n=((m,f)=>m===f),a=e instanceof Function?e():e,[i,s]=y.useState(a),c=y.useRef(a),p=Ue(s,t,r);return n(c.current,a)||(p(a),c.current=a),[i,p]}function ve(){const e=y.useRef(!1);return y.useEffect(()=>(e.current=!0,()=>{e.current=!1}),[]),y.useCallback(()=>e.current,[])}function Le(e){const t=K(({targetEVMNetwork:r})=>r);return j.targetEVMNetworks.find(r=>r.id===e)??t}const z=new Map;function ct(e){const t=ve(),r=typeof e=="string"?{contractName:e}:e;y.useEffect(()=>{typeof e=="string"&&console.warn("Using `useDeployedContractInfo` with a string parameter is deprecated. Please use the object parameter version instead.")},[e]);const{contractName:n,chainId:a}=r,i=Le(a),s=Fe?.[i.id]?.[n],c=s?`${i.id}-${s.address}`:void 0,p=c?z.get(c):void 0,[m,f]=y.useState(p??E.LOADING),d=Se({chainId:i.id});return y.useEffect(()=>{(async()=>{if(!s||!c){f(E.NOT_FOUND);return}if(!t()||!d)return;const k=z.get(c);if(k){f(k);return}try{const u=await d.getBytecode({address:s.address})==="0x"?E.NOT_FOUND:E.DEPLOYED;z.set(c,u),f(u)}catch(b){console.error(b),z.set(c,E.NOT_FOUND),f(E.NOT_FOUND)}})()},[t,c,s,d]),{data:m===E.DEPLOYED?s:void 0,isLoading:m===E.LOADING}}class R{constructor(){this.cache=new Map,this.pendingRequests=new Map}static getInstance(){return R.instance||(R.instance=new R),R.instance}async getClassHash(t,r,n="latest"){const a=`${r}-${n}`;if(this.cache.has(a))return this.cache.get(a);if(this.pendingRequests.has(a))return this.pendingRequests.get(a);const i=this.fetchClassHash(t,r,n,a);this.pendingRequests.set(a,i);try{return await i}finally{this.pendingRequests.delete(a)}}async fetchClassHash(t,r,n,a){try{const i=await t.getClassHashAt(r,n);return this.cache.set(a,i),i}catch(i){console.error("Failed to fetch class hash:",i);return}}clear(){this.cache.clear(),this.pendingRequests.clear()}}function X(){const{chainId:e}=se(),t=K(({targetSNNetwork:n})=>n),r=K(({setTargetSNNetwork:n})=>n);return y.useEffect(()=>{const n=j.targetSNNetworks.find(a=>a.id===e);n&&n.id!==t.id&&r(n)},[e,r,t.id]),{targetNetwork:{...t}}}const Ge={},Ke={devnet:{Eth:{address:te,abi:N,classHash:_e},Strk:{address:G,abi:N,classHash:we}},sepolia:{Eth:{address:te,abi:N,classHash:pe},Strk:{address:G,abi:N,classHash:ue}},mainnet:{Eth:{address:te,abi:N,classHash:pe},Strk:{address:G,abi:N,classHash:ue}}};var _=(e=>(e[e.LOADING=0]="LOADING",e[e.DEPLOYED=1]="DEPLOYED",e[e.NOT_FOUND=2]="NOT_FOUND",e))(_||{});const ie=(e,t)=>{const r={},n=Array.from(new Set([...Object.keys(e),...Object.keys(t)]));for(const a of n){const i=e[a],s=t[a];typeof i=="object"&&typeof s=="object"&&i!==null&&s!==null?r[a]=ie(i,s):r[a]=s!==void 0?s:i}return r},je=ie(Ke,Ge),We=ie(xe,je),$e=We,lt=e=>{const t=ve(),{targetNetwork:r}=X(),n=$e?.[r.network]?.[e],[a,i]=y.useState(_.LOADING),{provider:s}=ge();return y.useEffect(()=>{(async()=>{if(!n){i(_.NOT_FOUND);return}const m=await R.getInstance().getClassHash(s,n.address,"latest");if(t()){if(m==null){i(_.NOT_FOUND);return}i(_.DEPLOYED)}})()},[t,e,n,s]),{data:a===_.DEPLOYED?n:void 0,isLoading:a===_.LOADING,raw:n,status:a}},Ce=j.targetSNNetworks[0],Ye=Ce.network,ze=Ce.rpcUrls.public.http[0]||"";ze||console.warn(`No RPC Provider URL configured for ${Ye}. Using public provider.`);const De=Be({apiKey:j.alchemyApiKey}),ne=e=>{let t=e;const{account:r}=se(),{targetNetwork:n}=X();t===void 0&&r&&(t=r);const a=De(n);return async i=>{if(!t){g.error("Cannot access account"),console.error("⚡️ ~ file: useTransactor.tsx ~ error");return}let s=null,c;try{const p=await t.getChainId();s=g.loading(D.jsx(A,{step:"pending",message:"Waiting for approval..."}));const m=setTimeout(()=>{s&&g.remove(s)},1e4);try{if(typeof i=="function"){console.log("tx is a function");const d=await i();typeof d=="string"?c=d:c=d.transaction_hash}else if(i!=null)console.log("tx",i),c=(await t.execute(i)).transaction_hash;else throw new Error("Incorrect transaction passed to transactor");clearTimeout(m)}catch(d){throw clearTimeout(m),d}const f=p?J(n.network,c):"";g.remove(s),s=g.loading(D.jsx(A,{step:"sent",txHash:c,message:"Waiting for transaction to complete.",blockExplorerLink:f}));try{await a?.waitForTransaction(c),console.log("Transaction confirmed:",c)}catch(d){console.warn("Error waiting for transaction:",d)}g.remove(s),g.success(D.jsx(A,{step:"confirmed",txHash:c,message:"Transaction completed successfully!",blockExplorerLink:f})),typeof window<"u"&&window.dispatchEvent(new Event("txCompleted"))}catch(p){s&&g.remove(s);const m=p?.message||"",f=m.toLowerCase(),P=f.includes("user rejected")||f.includes("user denied")||f.includes("user cancelled")||f.includes("rejected")||f.includes("denied")||f.includes("cancelled")||p?.code===4001||p?.code==="ACTION_REJECTED"||p?.code==="USER_REJECTED"?"User rejected the request":(()=>{const u=/Contract (.*?)"}/.exec(m);return u?u[1]:m})();console.error("⚡️ ~ file: useTransactor.ts ~ error",P);const k=c?J(n.network,c):"";throw g.error(D.jsx(A,{step:"failed",txHash:c,message:P,blockExplorerLink:k})),p}return c}};try{ne.displayName="useTransactor",ne.__docgenInfo={description:"Runs Transaction passed in to returned function showing UI feedback.",displayName:"useTransactor",props:{address:{defaultValue:null,description:"The address of the account contract on Starknet",name:"address",required:!0,type:{name:"string"}},signer:{defaultValue:null,description:"Signer instance for signing transactions and messages",name:"signer",required:!0,type:{name:"SignerInterface"}},cairoVersion:{defaultValue:null,description:"Cairo version of the account contract implementation",name:"cairoVersion",required:!0,type:{name:"enum",value:[{value:"undefined"},{value:'"0"'},{value:'"1"'}]}},deployer:{defaultValue:{value:"Uses default UDC (Universal Deployer Contract) if not specified"},description:"Optional deployer instance for custom contract deployment logic",name:"deployer",required:!1,type:{name:"DeployerInterface"}},estimateInvokeFee:{defaultValue:null,description:`Estimate fee for executing an INVOKE transaction on Starknet
@param calls - Single call or array of calls to estimate fees for
@param calls.contractAddress - The address of the contract to invoke
@param calls.entrypoint - The function selector of the contract method
@param calls.calldata - The serialized function parameters (defaults to [])
@param estimateFeeDetails - Optional details for fee estimation
@param estimateFeeDetails.blockIdentifier - Block to estimate against
@param estimateFeeDetails.nonce - Account nonce (defaults to current nonce)
@param estimateFeeDetails.skipValidate - Skip account validation (default: true)
@param estimateFeeDetails.tip - Priority fee tip in fri/wei for faster inclusion
@param estimateFeeDetails.accountDeploymentData - Include account deployment
@param estimateFeeDetails.paymasterData - Paymaster sponsorship data
@param estimateFeeDetails.nonceDataAvailabilityMode - DA mode for nonce
@param estimateFeeDetails.feeDataAvailabilityMode - DA mode for fee
@param estimateFeeDetails.version - Transaction version (v3 uses fri, v1/v2 use wei)
@param estimateFeeDetails.resourceBounds - Resource limits for v3 transactions
@returns Fee estimation including overall_fee and resourceBounds
@example \`\`\`typescript
const fee = await account.estimateInvokeFee({
  contractAddress: '0x123...',
  entrypoint: 'transfer',
  calldata: [recipient, amount]
});
\`\`\``,name:"estimateInvokeFee",required:!0,type:{name:"(calls: AllowArray<Call>, estimateFeeDetails?: UniversalDetails | undefined) => Promise<EstimateFeeResponseOverhead>"}},estimateDeclareFee:{defaultValue:null,description:`Estimate fee for executing a DECLARE transaction on Starknet
@param contractPayload - Contract declaration payload
@param contractPayload.contract - Compiled contract (Sierra JSON)
@param contractPayload.casm - Compiled Cairo assembly (required for Cairo 1)
@param contractPayload.classHash - Pre-computed class hash (optional optimization)
@param contractPayload.compiledClassHash - Pre-computed CASM hash (alternative to casm)
@param estimateFeeDetails - Optional details for fee estimation
@param estimateFeeDetails.blockIdentifier - Block to estimate against
@param estimateFeeDetails.nonce - Account nonce (defaults to current nonce)
@param estimateFeeDetails.skipValidate - Skip account validation (default: true)
@param estimateFeeDetails.tip - Priority fee tip for faster inclusion
@param estimateFeeDetails.version - Transaction version (v3 uses fri, v1/v2 use wei)
@returns Fee estimation including overall_fee and resourceBounds
@example \`\`\`typescript
const fee = await account.estimateDeclareFee({
  contract: compiledContract,
  casm: compiledCasm
});
\`\`\``,name:"estimateDeclareFee",required:!0,type:{name:"(contractPayload: DeclareContractPayload, estimateFeeDetails?: UniversalDetails | undefined) => Promise<EstimateFeeResponseOverhead>"}},estimateAccountDeployFee:{defaultValue:null,description:`Estimate fee for executing a DEPLOY_ACCOUNT transaction on StarknetestimateInvokeFee
@param contractPayload - Account deployment payload
@param contractPayload.classHash - Class hash of the account contract
@param contractPayload.constructorCalldata - Constructor parameters
@param contractPayload.contractAddress - Pre-computed account address
@param contractPayload.addressSalt - Salt for address generation
@param estimateFeeDetails - Optional details for fee estimation
@inheritdoc estimateInvokeFee
@returns Fee estimation including overall_fee and resourceBounds
@example \`\`\`typescript
const fee = await account.estimateAccountDeployFee({
  classHash: accountClassHash,
  constructorCalldata: { publicKey },
  addressSalt: publicKey
});
\`\`\``,name:"estimateAccountDeployFee",required:!0,type:{name:"(contractPayload: DeployAccountContractPayload, estimateFeeDetails?: UniversalDetails | undefined) => Promise<EstimateFeeResponseOverhead>"}},estimateDeployFee:{defaultValue:null,description:`Estimate fee for deploying contract(s) through the Universal Deployer Contract (UDC)estimateInvokeFee
@param deployContractPayload - Single or array of deployment payloads
@param deployContractPayload.classHash - Class hash of contract to deploy
@param deployContractPayload.salt - Deployment salt (optional)
@param deployContractPayload.unique - Ensure unique deployment address
@param deployContractPayload.constructorCalldata - Constructor parameters
@param estimateFeeDetails - Optional details for fee estimation
@inheritdoc estimateInvokeFee
@returns Fee estimation for the deployment transaction
@example \`\`\`typescript
const fee = await account.estimateDeployFee({
  classHash: contractClassHash,
  constructorCalldata: [param1, param2],
  unique: true
});
\`\`\``,name:"estimateDeployFee",required:!0,type:{name:"(deployContractPayload: UniversalDeployerContractPayload | UniversalDeployerContractPayload[], estimateFeeDetails?: UniversalDetails | undefined) => Promise<...>"}},estimateFeeBulk:{defaultValue:null,description:`Estimate fees for executing multiple transactions in a single requestestimateInvokeFee
@param invocations - Array of transactions to estimate
@param invocations.type - Transaction type: DECLARE, DEPLOY, INVOKE, DEPLOY_ACCOUNT
@param invocations.payload - Transaction-specific payload
@param details - Optional details for fee estimation
@inheritdoc estimateInvokeFee
@returns Array of fee estimations for each transaction
@example \`\`\`typescript
const fees = await account.estimateFeeBulk([
  { type: 'INVOKE', payload: { contractAddress, entrypoint, calldata } },
  { type: 'DECLARE', payload: { contract, casm } }
]);
\`\`\``,name:"estimateFeeBulk",required:!0,type:{name:"(invocations: Invocations, details?: UniversalDetails | undefined) => Promise<EstimateFeeResponseBulkOverhead>"}},execute:{defaultValue:null,description:`Execute one or multiple calls through the account contract
@param transactions - Single call or array of calls to execute
@param transactions.contractAddress - Target contract address
@param transactions.entrypoint - Function to invoke on the contract
@param transactions.calldata - Function parameters
@param transactionsDetail - Transaction execution options
@param transactionsDetail.nonce - Override account nonce
@param transactionsDetail.maxFee - Maximum fee for v1/v2 transactions
@param transactionsDetail.resourceBounds - Resource limits for v3 transactions
@param transactionsDetail.tip - Priority fee tip
@param transactionsDetail.version - Force specific transaction version
@returns Transaction hash and response
@example \`\`\`typescript
const result = await account.execute([
  { contractAddress: token, entrypoint: 'transfer', calldata: [to, amount] },
  { contractAddress: nft, entrypoint: 'mint', calldata: [recipient] }
]);
\`\`\``,name:"execute",required:!0,type:{name:"(transactions: AllowArray<Call>, transactionsDetail?: InvocationsDetails | undefined) => Promise<{ transaction_hash: string; }>"}},estimatePaymasterTransactionFee:{defaultValue:null,description:`Estimate fees for a paymaster-sponsored transaction
@param calls - Array of calls to be sponsored
@param calls.contractAddress - Target contract address
@param calls.entrypoint - Function to invoke
@param calls.calldata - Function parameters
@param paymasterDetails - Paymaster configuration
@param paymasterDetails.feeMode - Sponsorship mode: 'sponsored' or gas token
@param paymasterDetails.deploymentData - Account deployment data if needed
@param paymasterDetails.timeBounds - Valid execution time window
@returns Fee estimates in both STRK and gas token
@example \`\`\`typescript
const fees = await account.estimatePaymasterTransactionFee(
  [{ contractAddress, entrypoint, calldata }],
  { feeMode: { mode: 'sponsored' } }
);
\`\`\``,name:"estimatePaymasterTransactionFee",required:!0,type:{name:"(calls: Call[], paymasterDetails: PaymasterDetails) => Promise<PaymasterFeeEstimate>"}},buildPaymasterTransaction:{defaultValue:null,description:`Build a transaction for paymaster executionestimatePaymasterTransactionFee
@param calls - Array of calls to be sponsored
@param paymasterDetails - Paymaster configuration
@inheritdoc estimatePaymasterTransactionFee
@returns Prepared transaction with typed data for signing
@example \`\`\`typescript
const prepared = await account.buildPaymasterTransaction(
  calls,
  { feeMode: { mode: 'default', gasToken: ETH_ADDRESS } }
);
\`\`\``,name:"buildPaymasterTransaction",required:!0,type:{name:"(calls: Call[], paymasterDetails: PaymasterDetails) => Promise<PreparedTransaction>"}},executePaymasterTransaction:{defaultValue:null,description:`Execute a paymaster-sponsored transaction
@param calls - Array of calls to execute
@param paymasterDetails - Paymaster configuration
@param paymasterDetails.feeMode - 'sponsored' or gas token payment
@param paymasterDetails.deploymentData - Deploy account if needed
@param paymasterDetails.timeBounds - Execution validity window (UNIX timestamps)
@param maxFeeInGasToken - Maximum acceptable fee in gas token
@returns Transaction hash if successful
@throws {Error} If gas token price exceeds maxFeeInGasToken
@throws {Error} If transaction parameters are modified by paymaster
@example \`\`\`typescript
const txHash = await account.executePaymasterTransaction(
  calls,
  { feeMode: { mode: 'sponsored' }, timeBounds: { executeBefore: Date.now()/1000 + 3600 } },
  maxFeeETH
);
\`\`\``,name:"executePaymasterTransaction",required:!0,type:{name:"(calls: Call[], paymasterDetails: PaymasterDetails, maxFeeInGasToken?: BigNumberish | undefined) => Promise<{ transaction_hash: string; }>"}},declare:{defaultValue:null,description:`Declare a contract class on Starknetexecute
@param contractPayload - Contract declaration payload
@param contractPayload.contract - Compiled Sierra contract
@param contractPayload.classHash - Pre-computed class hash (optional)
@param contractPayload.casm - Compiled CASM (required for Cairo 1)
@param contractPayload.compiledClassHash - Pre-computed CASM hash
@param transactionsDetail - Transaction execution options
@inheritdoc execute
@returns Declaration transaction hash and class hash
@example \`\`\`typescript
const declareResult = await account.declare({
  contract: compiledSierra,
  casm: compiledCasm
});
\`\`\``,name:"declare",required:!0,type:{name:"(contractPayload: DeclareContractPayload, transactionsDetail?: InvocationsDetails | undefined) => Promise<{ transaction_hash: string; class_hash: string; }>"}},deploy:{defaultValue:null,description:`Deploy contract(s) using the Universal Deployer Contract (UDC)execute
@param payload - Single or multiple deployment configurations
@param payload.classHash - Class hash of declared contract
@param payload.constructorCalldata - Constructor parameters
@param payload.salt - Deployment salt (random if not specified)
@param payload.unique - Modify salt for unique address (default: true)
@param details - Transaction execution options
@inheritdoc execute
@returns Deployed contract addresses and transaction hash
@example \`\`\`typescript
const deployment = await account.deploy([
  { classHash: erc20ClassHash, constructorCalldata: [name, symbol] },
  { classHash: nftClassHash, unique: true }
]);
\`\`\``,name:"deploy",required:!0,type:{name:"(payload: UniversalDeployerContractPayload | UniversalDeployerContractPayload[], details?: InvocationsDetails | undefined) => Promise<...>"}},deployContract:{defaultValue:null,description:`Deploy and wait for a contract deployment to completedeploy
@param payload - Deployment configuration(s)
@inheritdoc deploy
@param details - Transaction execution options
@inheritdoc execute
@returns Deployment result with contract address and UDC event details
@remarks This method waits for transaction confirmation before returning
@example \`\`\`typescript
const result = await account.deployContract({
  classHash: contractClassHash,
  constructorCalldata: params
});
console.log('Deployed at:', result.address);
\`\`\``,name:"deployContract",required:!0,type:{name:"(payload: UniversalDeployerContractPayload | UniversalDeployerContractPayload[], details?: InvocationsDetails | undefined) => Promise<...>"}},declareAndDeploy:{defaultValue:null,description:`Declare and deploy a contract in a single methodexecute
@param payload - Combined declare and deploy configuration
@param payload.contract - Compiled Sierra contract
@param payload.casm - Compiled CASM (required for Cairo 1)
@param payload.compiledClassHash - Pre-computed CASM hash
@param payload.classHash - Pre-computed class hash
@param payload.constructorCalldata - Constructor parameters
@param payload.salt - Deployment salt
@param payload.unique - Ensure unique deployment address
@param details - Transaction execution options
@inheritdoc execute
@returns Declaration and deployment results
@remarks - Automatically skips declaration if contract is already declared
- Waits for both transactions to complete
- Does not support batch operations
@example \`\`\`typescript
const result = await account.declareAndDeploy({
  contract: compiledContract,
  casm: compiledCasm,
  constructorCalldata: [param1, param2]
});
\`\`\``,name:"declareAndDeploy",required:!0,type:{name:"(payload: DeclareAndDeployContractPayload, details?: InvocationsDetails | undefined) => Promise<DeclareDeployUDCResponse>"}},deployAccount:{defaultValue:null,description:`Deploy the account contract itself on Starknetexecute
@param contractPayload - Account deployment configuration
@param contractPayload.classHash - Account contract class hash
@param contractPayload.constructorCalldata - Constructor parameters
@param contractPayload.addressSalt - Salt for address generation
@param contractPayload.contractAddress - Pre-computed address
@param transactionsDetail - Transaction execution options
@inheritdoc execute
@returns Deployment transaction hash and contract address
@remarks Used for deploying the account contract when using a pre-funded address
@example \`\`\`typescript
const deployment = await account.deployAccount({
  classHash: accountClassHash,
  constructorCalldata: { publicKey: pubKey },
  addressSalt: pubKey
});
\`\`\``,name:"deployAccount",required:!0,type:{name:"(contractPayload: DeployAccountContractPayload, transactionsDetail?: InvocationsDetails | undefined) => Promise<DeployContractResponse>"}},signMessage:{defaultValue:null,description:`Sign a typed data message for off-chain verification
@param typedData - EIP-712 style typed data structure
@returns Signature array [r, s]
@remarks - Includes domain separation to prevent signature reuse
- Compatible with Starknet's signature verification
- Cannot be used to sign transactions
@example \`\`\`typescript
const signature = await account.signMessage({
  domain: { name: 'MyDapp', chainId: 'SN_MAIN' },
  types: { ... },
  primaryType: 'Message',
  message: { content: 'Hello Starknet!' }
});
\`\`\``,name:"signMessage",required:!0,type:{name:"(typedData: TypedData) => Promise<Signature>"}},hashMessage:{defaultValue:null,description:`Hash a typed data message using Pedersen hash
@param typedData - EIP-712 style typed data structure
@returns Message hash as hex string
@remarks - Uses Pedersen hash function (not Keccak)
- Includes domain separation
- Result can be used for signature verification
@example \`\`\`typescript
const messageHash = await account.hashMessage(typedData);
\`\`\``,name:"hashMessage",required:!0,type:{name:"(typedData: TypedData) => Promise<string>"}},getNonce:{defaultValue:null,description:"Get the current nonce of the account\n@param blockIdentifier - Block to query nonce at (default: 'pending')\n@returns Account nonce as hex string\n@example ```typescript\nconst nonce = await account.getNonce();\nconst historicalNonce = await account.getNonce('latest');\n```",name:"getNonce",required:!0,type:{name:"(blockIdentifier?: BlockIdentifier | undefined) => Promise<string>"}},declareIfNot:{defaultValue:null,description:`Declare a contract class if not already declared
@param contractPayload - Contract declaration payload
@param transactionsDetail - Transaction execution options
@returns Declaration result (with empty transaction_hash if already declared)
@example \`\`\`typescript
const result = await account.declareIfNot({
  contract: compiledContract,
  casm: compiledCasm
});
\`\`\``,name:"declareIfNot",required:!0,type:{name:"(contractPayload: DeclareContractPayload, transactionsDetail?: InvocationsDetails | undefined) => Promise<{ transaction_hash: string; class_hash: string; }>"}},channel:{defaultValue:null,description:"",name:"channel",required:!0,type:{name:"RpcChannel$1 | RpcChannel"}},responseParser:{defaultValue:null,description:"",name:"responseParser",required:!0,type:{name:"RPCResponseParser"}},getChainId:{defaultValue:null,description:`Gets the Starknet chain Id
@returns the chain Id`,name:"getChainId",required:!0,type:{name:'() => Promise<"0x534e5f4d41494e" | "0x534e5f5345504f4c4941">'}},callContract:{defaultValue:null,description:`Calls a function on the Starknet contract.
@param call transaction to be called
@param blockIdentifier block identifier
@returns the result of the function on the smart contract.`,name:"callContract",required:!0,type:{name:"(call: Call, blockIdentifier?: BlockIdentifier | undefined) => Promise<CallContractResponse>"}},getBlock:{defaultValue:null,description:`Gets the block information
@param blockIdentifier block identifier
@returns the block object`,name:"getBlock",required:!0,type:{name:'{ (): Promise<{ transactions: string[]; parent_hash: string; timestamp: number; sequencer_address: string; l1_gas_price: RESOURCE_PRICE; l2_gas_price: RESOURCE_PRICE; l1_data_gas_price: RESOURCE_PRICE; l1_da_mode: L1_DA_MODE; starknet_version: string; }>; (blockIdentifier: "pre_confirmed"): Promise<...>; (blockIdent...'}},getClassAt:{defaultValue:null,description:`Gets the contract class of the deployed contract.
@param contractAddress - contract address
@param blockIdentifier - block identifier
@returns Contract class of compiled contract`,name:"getClassAt",required:!0,type:{name:"(contractAddress: BigNumberish, blockIdentifier?: BlockIdentifier | undefined) => Promise<ContractClassResponse>"}},getL1GasPrice:{defaultValue:null,description:`Gets the price of l1 gas in the block
@param blockIdentifier block identifier
@returns gas price of the block`,name:"getL1GasPrice",required:!0,type:{name:"(blockIdentifier?: BlockIdentifier | undefined) => Promise<string>"}},getL1MessageHash:{defaultValue:null,description:`Get L1 message hash from L2 transaction hash
@param l2TxHash L2 transaction hash
@returns Hex string of L1 message hash
@example In Sepolia Testnet :
\`\`\`typescript
const result = provider.getL1MessageHash('0x28dfc05eb4f261b37ddad451ff22f1d08d4e3c24dc646af0ec69fa20e096819');
// result = '0x55b3f8b6e607fffd9b4d843dfe8f9b5c05822cd94fcad8797deb01d77805532a'
\`\`\``,name:"getL1MessageHash",required:!0,type:{name:"(l2TxHash: BigNumberish) => Promise<string>"}},getClassHashAt:{defaultValue:null,description:`Returns the contract class hash in the given block for the contract deployed at the given address
@param contractAddress - contract address
@param blockIdentifier - block identifier
@returns Class hash`,name:"getClassHashAt",required:!0,type:{name:"(contractAddress: BigNumberish, blockIdentifier?: BlockIdentifier | undefined) => Promise<string>"}},getClassByHash:{defaultValue:null,description:`Returns the contract class deployed under the given class hash.
@param classHash - class hash
@returns Contract class of compiled contract`,name:"getClassByHash",required:!0,type:{name:"(classHash: BigNumberish) => Promise<ContractClassResponse>"}},getNonceForAddress:{defaultValue:null,description:`Returns the nonce associated with the given address in the given block
@param contractAddress - contract address
@returns the hex nonce`,name:"getNonceForAddress",required:!0,type:{name:"(contractAddress: BigNumberish, blockIdentifier?: BlockIdentifier | undefined) => Promise<string>"}},getStorageAt:{defaultValue:null,description:`Get the value of the storage (contract's variable) at the given address and key
@param contractAddress
@param key - from getStorageVarAddress('<STORAGE_VARIABLE_NAME>') (WIP)
@param blockIdentifier - block identifier
@returns the value of the storage variable`,name:"getStorageAt",required:!0,type:{name:"(contractAddress: BigNumberish, key: BigNumberish, blockIdentifier?: BlockIdentifier | undefined) => Promise<string>"}},getTransaction:{defaultValue:null,description:`Gets the transaction information from a tx id.
@param transactionHash
@returns the transaction object \\{ transaction_id, status, transaction, block_number?, block_number?, transaction_index?, transaction_failure_reason? \\}`,name:"getTransaction",required:!0,type:{name:"(transactionHash: BigNumberish) => Promise<TransactionWithHash>"}},getTransactionReceipt:{defaultValue:null,description:`Gets the transaction receipt from a tx hash.
@param transactionHash
@returns the transaction receipt object`,name:"getTransactionReceipt",required:!0,type:{name:"(transactionHash: BigNumberish) => Promise<GetTransactionReceiptResponse>"}},deployAccountContract:{defaultValue:null,description:`Deploys a given compiled Account contract (json) to starknet
@param payload payload to be deployed containing:
- compiled contract code
- constructor calldata
- address salt
@returns a confirmation of sending a transaction on the starknet contract`,name:"deployAccountContract",required:!0,type:{name:"(payload: DeployAccountContractPayload, details: InvocationsDetailsWithNonce) => Promise<DeployContractResponse>"}},invokeFunction:{defaultValue:null,description:`Invokes a function on starknet
@param invocation the invocation object containing:
- contractAddress - the address of the contract
- entrypoint - (optional) the entrypoint of the contract
- calldata - (optional, defaults to []) the calldata
- signature - (optional, defaults to []) the signature
@param details - optional details containing:
- nonce - optional nonce
- version - optional version
- maxFee - optional maxFee
@returns response from addTransaction`,name:"invokeFunction",required:!0,type:{name:"(invocation: Invocation, details: InvocationsDetailsWithNonce) => Promise<{ transaction_hash: string; }>"}},declareContract:{defaultValue:null,description:`Declares a given compiled contract (json) to starknet
@param transaction transaction payload to be deployed containing:
- compiled contract code
- sender address
- signature
@param details Invocation Details containing:
- nonce
- optional version
- optional maxFee
@returns a confirmation of sending a transaction on the starknet contract`,name:"declareContract",required:!0,type:{name:"(transaction: DeclareContractTransaction, details: InvocationsDetailsWithNonce) => Promise<{ transaction_hash: string; class_hash: string; }>"}},getInvokeEstimateFee:{defaultValue:null,description:`Estimates the fee for a given INVOKE transaction
@param invocation the invocation object containing:
- contractAddress - the address of the contract
- entrypoint - (optional) the entrypoint of the contract
- calldata - (optional, defaults to []) the calldata
- signature - (optional, defaults to []) the signature
@param details - optional details containing:
- nonce - optional nonce
- version - optional version
@param blockIdentifier - (optional) block identifier
@param skipValidate - (optional) skip cairo __validate__ method
@returns the estimated fee
@deprecated Consider using getEstimateFeeBulk for multiple transactions
@example \`\`\`typescript
const feeEstimate = await provider.getInvokeEstimateFee(invocation, details);
// Equivalent to:
const [feeEstimate] = await provider.getEstimateFeeBulk([{ type: ETransactionType.INVOKE, ...invocation, ...details }], options);
\`\`\`
@alias getEstimateFeeBulk - This method is an alias that calls getEstimateFeeBulk with a single transaction`,name:"getInvokeEstimateFee",required:!0,type:{name:"(invocation: Invocation, details: InvocationsDetailsWithNonce, blockIdentifier?: BlockIdentifier | undefined, skipValidate?: boolean | undefined) => Promise<...>"}},getDeclareEstimateFee:{defaultValue:null,description:`Estimates the fee for a given DECLARE transaction
@param transaction transaction payload to be declared containing:
- compiled contract code
- sender address
- signature - (defaults to []) the signature
@param details - optional details containing:
- nonce
- version - optional version
- optional maxFee
@param blockIdentifier - (optional) block identifier
@param skipValidate - (optional) skip cairo __validate__ method
@returns the estimated fee
@deprecated Consider using getEstimateFeeBulk for multiple transactions
@example \`\`\`typescript
const feeEstimate = await provider.getDeclareEstimateFee(transaction, details);
// Equivalent to:
const [feeEstimate] = await provider.getEstimateFeeBulk([{ type: ETransactionType.DECLARE, ...transaction, ...details }], options);
\`\`\`
@alias getEstimateFeeBulk - This method is an alias that calls getEstimateFeeBulk with a single transaction`,name:"getDeclareEstimateFee",required:!0,type:{name:"(transaction: DeclareContractTransaction, details: InvocationsDetailsWithNonce, blockIdentifier?: BlockIdentifier | undefined, skipValidate?: boolean | undefined) => Promise<...>"}},getDeployAccountEstimateFee:{defaultValue:null,description:`Estimates the fee for a given DEPLOY_ACCOUNT transaction
@param transaction transaction payload to be deployed containing:
- classHash
- constructorCalldata
- addressSalt
- signature - (defaults to []) the signature
@param details - optional details containing:
- nonce
- version - optional version
- optional maxFee
@param blockIdentifier - (optional) block identifier
@param skipValidate - (optional) skip cairo __validate__ method
@returns the estimated fee
@deprecated Consider using getEstimateFeeBulk for multiple transactions
@example \`\`\`typescript
const feeEstimate = await provider.getDeployAccountEstimateFee(transaction, details);
// Equivalent to:
const [feeEstimate] = await provider.getEstimateFeeBulk([{ type: ETransactionType.DEPLOY_ACCOUNT, ...transaction, ...details }], options);
\`\`\`
@alias getEstimateFeeBulk - This method is an alias that calls getEstimateFeeBulk with a single transaction`,name:"getDeployAccountEstimateFee",required:!0,type:{name:"(transaction: DeployAccountContractTransaction, details: InvocationsDetailsWithNonce, blockIdentifier?: BlockIdentifier | undefined, skipValidate?: boolean | undefined) => Promise<...>"}},getEstimateFeeBulk:{defaultValue:null,description:`Estimates the fee for a list of INVOKE transaction
@param invocations AccountInvocations - Complete invocations array with account details
@param options getEstimateFeeBulkOptions
- (optional) blockIdentifier - BlockIdentifier
@returns the estimated fee`,name:"getEstimateFeeBulk",required:!0,type:{name:"(invocations: AccountInvocations, options?: getEstimateFeeBulkOptions | undefined) => Promise<EstimateFeeResponseBulkOverhead>"}},waitForTransaction:{defaultValue:null,description:`Wait for the transaction to be accepted
@param txHash - transaction hash
@param options waitForTransactionOptions
- (optional) retryInterval: number | undefined;
- (optional) successStates: TransactionStatus[] | undefined;
@return GetTransactionReceiptResponse`,name:"waitForTransaction",required:!0,type:{name:"(txHash: BigNumberish, options?: waitForTransactionOptions | undefined) => Promise<GetTransactionReceiptResponse>"}},getSimulateTransaction:{defaultValue:null,description:`Simulates the transaction and returns the transaction trace and estimated fee.
@param invocations AccountInvocations - Complete invocations array with account details
@param options - getSimulateTransactionOptions
- (optional) blockIdentifier - block identifier
- (optional) skipValidate - skip cairo __validate__ method
- (optional) skipExecute - skip cairo __execute__ method
@returns an array of transaction trace and estimated fee`,name:"getSimulateTransaction",required:!0,type:{name:"(invocations: AccountInvocations, options?: getSimulateTransactionOptions | undefined) => Promise<SimulateTransactionOverheadResponse>"}},getStateUpdate:{defaultValue:null,description:`Gets the state changes in a specific block (result of executing the requested block)
@param blockIdentifier - block identifier
@returns StateUpdateResponse`,name:"getStateUpdate",required:!0,type:{name:"(blockIdentifier?: BlockIdentifier | undefined) => Promise<StateUpdateResponse>"}},getBlockStateUpdate:{defaultValue:null,description:`Gets the state changes in a specific block (result of executing the requested block)
Alternative method name for getStateUpdate with specific overloads
@param blockIdentifier - block identifier
@returns StateUpdateResponse`,name:"getBlockStateUpdate",required:!0,type:{name:"{ (): Promise<{ block_hash: string; new_root: string; old_root: string; state_diff: { storage_diffs: { address: string; storage_entries: { key: string; value: string; }[]; }[]; deprecated_declared_classes: string[]; declared_classes: { ...; }[]; deployed_contracts: { ...; }[]; replaced_classes: { ...; }[]; nonces: {..."}},getContractVersion:{defaultValue:null,description:`Gets the contract version from the provided address
@param contractAddress string
@param classHash undefined
@param options - getContractVersionOptions
- (optional) compiler - (default true) extract compiler version using type tactic from abi
- (optional) blockIdentifier - block identifier
@param contractAddress undefined
@param classHash
@param options - getContractVersionOptions
- (optional) compiler - (default true) extract compiler version using type tactic from abi
- (optional) blockIdentifier - block identifier`,name:"getContractVersion",required:!0,type:{name:"{ (contractAddress: BigNumberish, classHash?: undefined, options?: getContractVersionOptions | undefined): Promise<ContractVersion>; (contractAddress: undefined, classHash: BigNumberish, options?: getContractVersionOptions | undefined): Promise<...>; }"}},getBlockLatestAccepted:{defaultValue:null,description:`Get the most recent accepted block hash and number
@returns Object containing block hash and number`,name:"getBlockLatestAccepted",required:!0,type:{name:"() => Promise<{ block_hash: string; block_number: number; }>"}},getBlockNumber:{defaultValue:null,description:`Get the most recent accepted block number
@returns Number of the latest block`,name:"getBlockNumber",required:!0,type:{name:"() => Promise<number>"}},getBlockWithTxHashes:{defaultValue:null,description:`Get block information with transaction hashes
@param blockIdentifier - block identifier
@returns Block with transaction hashes`,name:"getBlockWithTxHashes",required:!0,type:{name:"(blockIdentifier?: BlockIdentifier | undefined) => Promise<any>"}},getBlockWithTxs:{defaultValue:null,description:`Get block information with full transactions
@param blockIdentifier - block identifier
@returns Block with full transactions`,name:"getBlockWithTxs",required:!0,type:{name:"(blockIdentifier?: BlockIdentifier | undefined) => Promise<any>"}},getBlockWithReceipts:{defaultValue:null,description:`Get block information with transaction receipts
@param blockIdentifier - block identifier
@returns Block with transaction receipts`,name:"getBlockWithReceipts",required:!0,type:{name:"(blockIdentifier?: BlockIdentifier | undefined) => Promise<any>"}},getBlockTransactionsTraces:{defaultValue:null,description:`Get transaction traces for all transactions in a block
@param blockIdentifier - block identifier
@returns Array of transaction traces`,name:"getBlockTransactionsTraces",required:!0,type:{name:"(blockIdentifier?: BlockIdentifier | undefined) => Promise<any>"}},getBlockTransactionCount:{defaultValue:null,description:`Get the number of transactions in a block
@param blockIdentifier - block identifier
@returns Transaction count`,name:"getBlockTransactionCount",required:!0,type:{name:"(blockIdentifier?: BlockIdentifier | undefined) => Promise<number>"}},waitForBlock:{defaultValue:null,description:"Pause execution until a specified block is created\n@param blockIdentifier - block number or tag\n@param retryInterval - milliseconds between requests (default: 5000)\n@example ```typescript\nawait provider.waitForBlock(12345);\nawait provider.waitForBlock('latest');\n```",name:"waitForBlock",required:!0,type:{name:"(blockIdentifier?: BlockIdentifier | undefined, retryInterval?: number | undefined) => Promise<void>"}},getTransactionByHash:{defaultValue:null,description:`Gets the transaction information from a tx hash (alias for getTransaction)
@param txHash - transaction hash
@returns Transaction information`,name:"getTransactionByHash",required:!0,type:{name:"(txHash: BigNumberish) => Promise<TransactionWithHash>"}},getTransactionByBlockIdAndIndex:{defaultValue:null,description:`Gets transaction by block identifier and index
@param blockIdentifier - block identifier
@param index - transaction index in the block
@returns Transaction information`,name:"getTransactionByBlockIdAndIndex",required:!0,type:{name:"(blockIdentifier: BlockIdentifier, index: number) => Promise<TransactionWithHash>"}},getTransactionTrace:{defaultValue:null,description:`Gets the transaction trace
@param txHash - transaction hash
@returns Transaction trace`,name:"getTransactionTrace",required:!0,type:{name:"(txHash: BigNumberish) => Promise<TRANSACTION_TRACE | TRANSACTION_TRACE>"}},getTransactionStatus:{defaultValue:null,description:`Get the status of a transaction
@param transactionHash - transaction hash
@returns Transaction status`,name:"getTransactionStatus",required:!0,type:{name:"(transactionHash: BigNumberish) => Promise<any>"}},fetch:{defaultValue:null,description:`Direct RPC method call
@param method - RPC method name
@param params - method parameters
@param id - request ID
@returns RPC response`,name:"fetch",required:!0,type:{name:"(method: string, params?: object | undefined, id?: string | number | undefined) => Promise<any>"}},readSpecVersion:{defaultValue:null,description:`Read channel spec version
@returns Spec version string or undefined if not set`,name:"readSpecVersion",required:!0,type:{name:"() => string | undefined"}},getSpecVersion:{defaultValue:null,description:`Get channel spec version
@returns Promise resolving to spec version`,name:"getSpecVersion",required:!0,type:{name:"() => Promise<string>"}},setUpSpecVersion:{defaultValue:null,description:`Setup channel spec version and return it
@returns Promise resolving to spec version`,name:"setUpSpecVersion",required:!0,type:{name:"() => Promise<string>"}},getClass:{defaultValue:null,description:`Get contract class by hash with optional block identifier
@param classHash - class hash
@param blockIdentifier - block identifier
@returns Contract class`,name:"getClass",required:!0,type:{name:"(classHash: BigNumberish, blockIdentifier?: BlockIdentifier | undefined) => Promise<ContractClassResponse>"}},estimateMessageFee:{defaultValue:null,description:`Estimate the fee for a message from L1
@param message - L1 message
@param blockIdentifier - block identifier
@returns Fee estimate`,name:"estimateMessageFee",required:!0,type:{name:"(message: MSG_FROM_L1, blockIdentifier?: BlockIdentifier | undefined) => Promise<FEE_ESTIMATE | MESSAGE_FEE_ESTIMATE>"}},getSyncingStats:{defaultValue:null,description:`Get node synchronization status
@returns Sync status or false if not syncing`,name:"getSyncingStats",required:!0,type:{name:"() => Promise<any>"}},getEvents:{defaultValue:null,description:`Get events matching the given filter
@param eventFilter - event filter
@returns Events and pagination info`,name:"getEvents",required:!0,type:{name:"(eventFilter: EventFilter | EventFilter) => Promise<EVENTS_CHUNK | EVENTS_CHUNK>"}},verifyMessageInStarknet:{defaultValue:null,description:`Verify in Starknet a signature of a TypedData object or of a given hash.
@param message TypedData object to be verified, or message hash to be verified.
@param signature signature of the message.
@param accountAddress address of the account that has signed the message.
@param signatureVerificationFunctionName if account contract with non standard account verification function name.
@param  : string[]; nokResponse: string[]; error: string[] } [signatureVerificationResponse] if account contract with non standard response of verification function.
@returns \`\`\`typescript
const myTypedMessage: TypedMessage = .... ;
const messageHash = typedData.getMessageHash(myTypedMessage,accountAddress);
const sign: WeierstrassSignatureType = ec.starkCurve.sign(messageHash, privateKey);
const accountAddress = "0x43b7240d227aa2fb8434350b3321c40ac1b88c7067982549e7609870621b535";
const result1 = await myRpcProvider.verifyMessageInStarknet(myTypedMessage, sign, accountAddress);
const result2 = await myRpcProvider.verifyMessageInStarknet(messageHash, sign, accountAddress);
// result1 = result2 = true
\`\`\``,name:"verifyMessageInStarknet",required:!0,type:{name:"(message: BigNumberish | TypedData, signature: Signature, accountAddress: BigNumberish, signatureVerificationFunctionName?: string | undefined, signatureVerificationResponse?: { ...; } | undefined) => Promise<...>"}},isClassDeclared:{defaultValue:null,description:`Test if class is already declared
@param contractClassIdentifier - contract class identifier
@param blockIdentifier - block identifier
@returns true if class is declared`,name:"isClassDeclared",required:!0,type:{name:"(contractClassIdentifier: ContractClassIdentifier, blockIdentifier?: BlockIdentifier | undefined) => Promise<boolean>"}},prepareInvocations:{defaultValue:null,description:`Build bulk invocations with auto-detect declared class
@param invocations - array of invocations
@returns Prepared invocations`,name:"prepareInvocations",required:!0,type:{name:"(invocations: Invocations) => Promise<Invocations>"}},getL1MessagesStatus:{defaultValue:null,description:`Get L1 messages status for a transaction
@param transactionHash - L1 transaction hash
@returns L1 message status`,name:"getL1MessagesStatus",required:!0,type:{name:"(transactionHash: BigNumberish) => Promise<L1L2MessagesStatus | L1L2MessagesStatus>"}},getStorageProof:{defaultValue:null,description:`Get Merkle paths in state tries
@param classHashes - class hashes
@param contractAddresses - contract addresses
@param contractsStorageKeys - storage keys
@param blockIdentifier - block identifier
@returns Storage proof`,name:"getStorageProof",required:!0,type:{name:"(classHashes: BigNumberish[], contractAddresses: BigNumberish[], contractsStorageKeys: CONTRACT_STORAGE_KEYS[], blockIdentifier?: BlockIdentifier | undefined) => Promise<...>"}},getCompiledCasm:{defaultValue:null,description:`Get compiled CASM contract class
@param classHash - class hash
@returns Compiled CASM contract class`,name:"getCompiledCasm",required:!0,type:{name:"(classHash: BigNumberish) => Promise<CASM_COMPILED_CONTRACT_CLASS>"}},getEstimateTip:{defaultValue:null,description:`Get transaction tip estimation based on network analysis
@param blockIdentifier - block identifier to analyze from
@param options - tip analysis options
@returns Tip estimation with statistics
@example \`\`\`typescript
const tipEstimate = await provider.getEstimateTip('latest', {
  maxBlocks: 10,
  minTxsNecessary: 5
});
console.log('Recommended tip:', tipEstimate.recommendedTip);
\`\`\``,name:"getEstimateTip",required:!0,type:{name:"(blockIdentifier?: BlockIdentifier | undefined, options?: TipAnalysisOptions | undefined) => Promise<TipEstimate>"}}}}}catch{}const re=e=>{let t=e;const{account:r}=se(),{targetNetwork:n}=X(),{selectedToken:a}=ke();t===void 0&&r&&(t=r);const i=De(n),s=a?.address?.toLowerCase(),c=G.toLowerCase(),{data:p}=be(),m=s===c||a?.symbol?.toUpperCase?.()==="STRK",f=!!s&&!!p?.some(k=>(k?.token_address||"")?.toLowerCase()===s),d=!m&&f,{sendAsync:P}=Ve({calls:[],options:{feeMode:d&&s?{mode:"default",gasToken:s}:{mode:"sponsored"}}});return async k=>{if(!t){g.error("Cannot access account"),console.error("⚡️ ~ file: usePaymasterTransactor.tsx ~ error");return}let b=null,u;try{const S=await t.getChainId(),x=d?"gasless":"regular",F=d?a?.symbol:"STRK";b=g.loading(D.jsx(A,{step:"pending",message:`Waiting for approval... (${x}, gas: ${F})`}));const B=setTimeout(()=>{b&&g.remove(b)},1e4);try{if(typeof k=="function"){const l=await k();if(typeof l=="string")u=l;else if("transaction_hash"in l)u=l.transaction_hash;else{const v=Array.isArray(l)?l:[l];d&&a?.address?(L.debug(`Using paymaster with ${a.symbol} for gas payment`),u=(await P(v)).transaction_hash):(L.debug("Using regular transaction with STRK for gas payment"),u=(await t.execute(v)).transaction_hash)}}else if(k!=null){const l=Array.isArray(k)?k:[k];d&&a?.address?(L.debug(`Using paymaster with ${a.symbol} for gas payment`),u=(await P(l)).transaction_hash):(L.debug("Using regular transaction with STRK for gas payment"),u=(await t.execute(l)).transaction_hash)}else throw new Error("Incorrect transaction passed to transactor");clearTimeout(B)}catch(l){throw clearTimeout(B),l}const V=S?J(n.network,u):"";g.remove(b),b=g.loading(D.jsx(A,{step:"sent",txHash:u,message:`Waiting for ${x} transaction to complete...`,blockExplorerLink:V}));try{await i?.waitForTransaction(u),L.debug("Transaction confirmed:",u)}catch(l){console.warn("Error waiting for transaction:",l)}g.remove(b);const o=d?`Gasless transaction completed! (Paid with ${F})`:"Transaction completed successfully!";g.success(D.jsx(A,{step:"confirmed",txHash:u,message:o,blockExplorerLink:V})),typeof window<"u"&&window.dispatchEvent(new Event("txCompleted"))}catch(S){b&&g.remove(b);const F=/Contract (.*?)"}/.exec(S.message),B=F?F[1]:S.message;console.error("⚡️ ~ file: usePaymasterTransactor.tsx ~ error",B);const V=u?J(n.network,u):"";throw g.error(D.jsx(A,{step:"failed",txHash:u,message:B,blockExplorerLink:V})),S}return u}};try{re.displayName="usePaymasterTransactor",re.__docgenInfo={description:`Paymaster-aware transactor that automatically uses gasless transactions when non-STRK token is selected.
Falls back to regular transactions for STRK or when paymaster is unavailable.`,displayName:"usePaymasterTransactor",props:{address:{defaultValue:null,description:"The address of the account contract on Starknet",name:"address",required:!0,type:{name:"string"}},signer:{defaultValue:null,description:"Signer instance for signing transactions and messages",name:"signer",required:!0,type:{name:"SignerInterface"}},cairoVersion:{defaultValue:null,description:"Cairo version of the account contract implementation",name:"cairoVersion",required:!0,type:{name:"enum",value:[{value:"undefined"},{value:'"0"'},{value:'"1"'}]}},deployer:{defaultValue:{value:"Uses default UDC (Universal Deployer Contract) if not specified"},description:"Optional deployer instance for custom contract deployment logic",name:"deployer",required:!1,type:{name:"DeployerInterface"}},estimateInvokeFee:{defaultValue:null,description:`Estimate fee for executing an INVOKE transaction on Starknet
@param calls - Single call or array of calls to estimate fees for
@param calls.contractAddress - The address of the contract to invoke
@param calls.entrypoint - The function selector of the contract method
@param calls.calldata - The serialized function parameters (defaults to [])
@param estimateFeeDetails - Optional details for fee estimation
@param estimateFeeDetails.blockIdentifier - Block to estimate against
@param estimateFeeDetails.nonce - Account nonce (defaults to current nonce)
@param estimateFeeDetails.skipValidate - Skip account validation (default: true)
@param estimateFeeDetails.tip - Priority fee tip in fri/wei for faster inclusion
@param estimateFeeDetails.accountDeploymentData - Include account deployment
@param estimateFeeDetails.paymasterData - Paymaster sponsorship data
@param estimateFeeDetails.nonceDataAvailabilityMode - DA mode for nonce
@param estimateFeeDetails.feeDataAvailabilityMode - DA mode for fee
@param estimateFeeDetails.version - Transaction version (v3 uses fri, v1/v2 use wei)
@param estimateFeeDetails.resourceBounds - Resource limits for v3 transactions
@returns Fee estimation including overall_fee and resourceBounds
@example \`\`\`typescript
const fee = await account.estimateInvokeFee({
  contractAddress: '0x123...',
  entrypoint: 'transfer',
  calldata: [recipient, amount]
});
\`\`\``,name:"estimateInvokeFee",required:!0,type:{name:"(calls: AllowArray<Call>, estimateFeeDetails?: UniversalDetails | undefined) => Promise<EstimateFeeResponseOverhead>"}},estimateDeclareFee:{defaultValue:null,description:`Estimate fee for executing a DECLARE transaction on Starknet
@param contractPayload - Contract declaration payload
@param contractPayload.contract - Compiled contract (Sierra JSON)
@param contractPayload.casm - Compiled Cairo assembly (required for Cairo 1)
@param contractPayload.classHash - Pre-computed class hash (optional optimization)
@param contractPayload.compiledClassHash - Pre-computed CASM hash (alternative to casm)
@param estimateFeeDetails - Optional details for fee estimation
@param estimateFeeDetails.blockIdentifier - Block to estimate against
@param estimateFeeDetails.nonce - Account nonce (defaults to current nonce)
@param estimateFeeDetails.skipValidate - Skip account validation (default: true)
@param estimateFeeDetails.tip - Priority fee tip for faster inclusion
@param estimateFeeDetails.version - Transaction version (v3 uses fri, v1/v2 use wei)
@returns Fee estimation including overall_fee and resourceBounds
@example \`\`\`typescript
const fee = await account.estimateDeclareFee({
  contract: compiledContract,
  casm: compiledCasm
});
\`\`\``,name:"estimateDeclareFee",required:!0,type:{name:"(contractPayload: DeclareContractPayload, estimateFeeDetails?: UniversalDetails | undefined) => Promise<EstimateFeeResponseOverhead>"}},estimateAccountDeployFee:{defaultValue:null,description:`Estimate fee for executing a DEPLOY_ACCOUNT transaction on StarknetestimateInvokeFee
@param contractPayload - Account deployment payload
@param contractPayload.classHash - Class hash of the account contract
@param contractPayload.constructorCalldata - Constructor parameters
@param contractPayload.contractAddress - Pre-computed account address
@param contractPayload.addressSalt - Salt for address generation
@param estimateFeeDetails - Optional details for fee estimation
@inheritdoc estimateInvokeFee
@returns Fee estimation including overall_fee and resourceBounds
@example \`\`\`typescript
const fee = await account.estimateAccountDeployFee({
  classHash: accountClassHash,
  constructorCalldata: { publicKey },
  addressSalt: publicKey
});
\`\`\``,name:"estimateAccountDeployFee",required:!0,type:{name:"(contractPayload: DeployAccountContractPayload, estimateFeeDetails?: UniversalDetails | undefined) => Promise<EstimateFeeResponseOverhead>"}},estimateDeployFee:{defaultValue:null,description:`Estimate fee for deploying contract(s) through the Universal Deployer Contract (UDC)estimateInvokeFee
@param deployContractPayload - Single or array of deployment payloads
@param deployContractPayload.classHash - Class hash of contract to deploy
@param deployContractPayload.salt - Deployment salt (optional)
@param deployContractPayload.unique - Ensure unique deployment address
@param deployContractPayload.constructorCalldata - Constructor parameters
@param estimateFeeDetails - Optional details for fee estimation
@inheritdoc estimateInvokeFee
@returns Fee estimation for the deployment transaction
@example \`\`\`typescript
const fee = await account.estimateDeployFee({
  classHash: contractClassHash,
  constructorCalldata: [param1, param2],
  unique: true
});
\`\`\``,name:"estimateDeployFee",required:!0,type:{name:"(deployContractPayload: UniversalDeployerContractPayload | UniversalDeployerContractPayload[], estimateFeeDetails?: UniversalDetails | undefined) => Promise<...>"}},estimateFeeBulk:{defaultValue:null,description:`Estimate fees for executing multiple transactions in a single requestestimateInvokeFee
@param invocations - Array of transactions to estimate
@param invocations.type - Transaction type: DECLARE, DEPLOY, INVOKE, DEPLOY_ACCOUNT
@param invocations.payload - Transaction-specific payload
@param details - Optional details for fee estimation
@inheritdoc estimateInvokeFee
@returns Array of fee estimations for each transaction
@example \`\`\`typescript
const fees = await account.estimateFeeBulk([
  { type: 'INVOKE', payload: { contractAddress, entrypoint, calldata } },
  { type: 'DECLARE', payload: { contract, casm } }
]);
\`\`\``,name:"estimateFeeBulk",required:!0,type:{name:"(invocations: Invocations, details?: UniversalDetails | undefined) => Promise<EstimateFeeResponseBulkOverhead>"}},execute:{defaultValue:null,description:`Execute one or multiple calls through the account contract
@param transactions - Single call or array of calls to execute
@param transactions.contractAddress - Target contract address
@param transactions.entrypoint - Function to invoke on the contract
@param transactions.calldata - Function parameters
@param transactionsDetail - Transaction execution options
@param transactionsDetail.nonce - Override account nonce
@param transactionsDetail.maxFee - Maximum fee for v1/v2 transactions
@param transactionsDetail.resourceBounds - Resource limits for v3 transactions
@param transactionsDetail.tip - Priority fee tip
@param transactionsDetail.version - Force specific transaction version
@returns Transaction hash and response
@example \`\`\`typescript
const result = await account.execute([
  { contractAddress: token, entrypoint: 'transfer', calldata: [to, amount] },
  { contractAddress: nft, entrypoint: 'mint', calldata: [recipient] }
]);
\`\`\``,name:"execute",required:!0,type:{name:"(transactions: AllowArray<Call>, transactionsDetail?: InvocationsDetails | undefined) => Promise<{ transaction_hash: string; }>"}},estimatePaymasterTransactionFee:{defaultValue:null,description:`Estimate fees for a paymaster-sponsored transaction
@param calls - Array of calls to be sponsored
@param calls.contractAddress - Target contract address
@param calls.entrypoint - Function to invoke
@param calls.calldata - Function parameters
@param paymasterDetails - Paymaster configuration
@param paymasterDetails.feeMode - Sponsorship mode: 'sponsored' or gas token
@param paymasterDetails.deploymentData - Account deployment data if needed
@param paymasterDetails.timeBounds - Valid execution time window
@returns Fee estimates in both STRK and gas token
@example \`\`\`typescript
const fees = await account.estimatePaymasterTransactionFee(
  [{ contractAddress, entrypoint, calldata }],
  { feeMode: { mode: 'sponsored' } }
);
\`\`\``,name:"estimatePaymasterTransactionFee",required:!0,type:{name:"(calls: Call[], paymasterDetails: PaymasterDetails) => Promise<PaymasterFeeEstimate>"}},buildPaymasterTransaction:{defaultValue:null,description:`Build a transaction for paymaster executionestimatePaymasterTransactionFee
@param calls - Array of calls to be sponsored
@param paymasterDetails - Paymaster configuration
@inheritdoc estimatePaymasterTransactionFee
@returns Prepared transaction with typed data for signing
@example \`\`\`typescript
const prepared = await account.buildPaymasterTransaction(
  calls,
  { feeMode: { mode: 'default', gasToken: ETH_ADDRESS } }
);
\`\`\``,name:"buildPaymasterTransaction",required:!0,type:{name:"(calls: Call[], paymasterDetails: PaymasterDetails) => Promise<PreparedTransaction>"}},executePaymasterTransaction:{defaultValue:null,description:`Execute a paymaster-sponsored transaction
@param calls - Array of calls to execute
@param paymasterDetails - Paymaster configuration
@param paymasterDetails.feeMode - 'sponsored' or gas token payment
@param paymasterDetails.deploymentData - Deploy account if needed
@param paymasterDetails.timeBounds - Execution validity window (UNIX timestamps)
@param maxFeeInGasToken - Maximum acceptable fee in gas token
@returns Transaction hash if successful
@throws {Error} If gas token price exceeds maxFeeInGasToken
@throws {Error} If transaction parameters are modified by paymaster
@example \`\`\`typescript
const txHash = await account.executePaymasterTransaction(
  calls,
  { feeMode: { mode: 'sponsored' }, timeBounds: { executeBefore: Date.now()/1000 + 3600 } },
  maxFeeETH
);
\`\`\``,name:"executePaymasterTransaction",required:!0,type:{name:"(calls: Call[], paymasterDetails: PaymasterDetails, maxFeeInGasToken?: BigNumberish | undefined) => Promise<{ transaction_hash: string; }>"}},declare:{defaultValue:null,description:`Declare a contract class on Starknetexecute
@param contractPayload - Contract declaration payload
@param contractPayload.contract - Compiled Sierra contract
@param contractPayload.classHash - Pre-computed class hash (optional)
@param contractPayload.casm - Compiled CASM (required for Cairo 1)
@param contractPayload.compiledClassHash - Pre-computed CASM hash
@param transactionsDetail - Transaction execution options
@inheritdoc execute
@returns Declaration transaction hash and class hash
@example \`\`\`typescript
const declareResult = await account.declare({
  contract: compiledSierra,
  casm: compiledCasm
});
\`\`\``,name:"declare",required:!0,type:{name:"(contractPayload: DeclareContractPayload, transactionsDetail?: InvocationsDetails | undefined) => Promise<{ transaction_hash: string; class_hash: string; }>"}},deploy:{defaultValue:null,description:`Deploy contract(s) using the Universal Deployer Contract (UDC)execute
@param payload - Single or multiple deployment configurations
@param payload.classHash - Class hash of declared contract
@param payload.constructorCalldata - Constructor parameters
@param payload.salt - Deployment salt (random if not specified)
@param payload.unique - Modify salt for unique address (default: true)
@param details - Transaction execution options
@inheritdoc execute
@returns Deployed contract addresses and transaction hash
@example \`\`\`typescript
const deployment = await account.deploy([
  { classHash: erc20ClassHash, constructorCalldata: [name, symbol] },
  { classHash: nftClassHash, unique: true }
]);
\`\`\``,name:"deploy",required:!0,type:{name:"(payload: UniversalDeployerContractPayload | UniversalDeployerContractPayload[], details?: InvocationsDetails | undefined) => Promise<...>"}},deployContract:{defaultValue:null,description:`Deploy and wait for a contract deployment to completedeploy
@param payload - Deployment configuration(s)
@inheritdoc deploy
@param details - Transaction execution options
@inheritdoc execute
@returns Deployment result with contract address and UDC event details
@remarks This method waits for transaction confirmation before returning
@example \`\`\`typescript
const result = await account.deployContract({
  classHash: contractClassHash,
  constructorCalldata: params
});
console.log('Deployed at:', result.address);
\`\`\``,name:"deployContract",required:!0,type:{name:"(payload: UniversalDeployerContractPayload | UniversalDeployerContractPayload[], details?: InvocationsDetails | undefined) => Promise<...>"}},declareAndDeploy:{defaultValue:null,description:`Declare and deploy a contract in a single methodexecute
@param payload - Combined declare and deploy configuration
@param payload.contract - Compiled Sierra contract
@param payload.casm - Compiled CASM (required for Cairo 1)
@param payload.compiledClassHash - Pre-computed CASM hash
@param payload.classHash - Pre-computed class hash
@param payload.constructorCalldata - Constructor parameters
@param payload.salt - Deployment salt
@param payload.unique - Ensure unique deployment address
@param details - Transaction execution options
@inheritdoc execute
@returns Declaration and deployment results
@remarks - Automatically skips declaration if contract is already declared
- Waits for both transactions to complete
- Does not support batch operations
@example \`\`\`typescript
const result = await account.declareAndDeploy({
  contract: compiledContract,
  casm: compiledCasm,
  constructorCalldata: [param1, param2]
});
\`\`\``,name:"declareAndDeploy",required:!0,type:{name:"(payload: DeclareAndDeployContractPayload, details?: InvocationsDetails | undefined) => Promise<DeclareDeployUDCResponse>"}},deployAccount:{defaultValue:null,description:`Deploy the account contract itself on Starknetexecute
@param contractPayload - Account deployment configuration
@param contractPayload.classHash - Account contract class hash
@param contractPayload.constructorCalldata - Constructor parameters
@param contractPayload.addressSalt - Salt for address generation
@param contractPayload.contractAddress - Pre-computed address
@param transactionsDetail - Transaction execution options
@inheritdoc execute
@returns Deployment transaction hash and contract address
@remarks Used for deploying the account contract when using a pre-funded address
@example \`\`\`typescript
const deployment = await account.deployAccount({
  classHash: accountClassHash,
  constructorCalldata: { publicKey: pubKey },
  addressSalt: pubKey
});
\`\`\``,name:"deployAccount",required:!0,type:{name:"(contractPayload: DeployAccountContractPayload, transactionsDetail?: InvocationsDetails | undefined) => Promise<DeployContractResponse>"}},signMessage:{defaultValue:null,description:`Sign a typed data message for off-chain verification
@param typedData - EIP-712 style typed data structure
@returns Signature array [r, s]
@remarks - Includes domain separation to prevent signature reuse
- Compatible with Starknet's signature verification
- Cannot be used to sign transactions
@example \`\`\`typescript
const signature = await account.signMessage({
  domain: { name: 'MyDapp', chainId: 'SN_MAIN' },
  types: { ... },
  primaryType: 'Message',
  message: { content: 'Hello Starknet!' }
});
\`\`\``,name:"signMessage",required:!0,type:{name:"(typedData: TypedData) => Promise<Signature>"}},hashMessage:{defaultValue:null,description:`Hash a typed data message using Pedersen hash
@param typedData - EIP-712 style typed data structure
@returns Message hash as hex string
@remarks - Uses Pedersen hash function (not Keccak)
- Includes domain separation
- Result can be used for signature verification
@example \`\`\`typescript
const messageHash = await account.hashMessage(typedData);
\`\`\``,name:"hashMessage",required:!0,type:{name:"(typedData: TypedData) => Promise<string>"}},getNonce:{defaultValue:null,description:"Get the current nonce of the account\n@param blockIdentifier - Block to query nonce at (default: 'pending')\n@returns Account nonce as hex string\n@example ```typescript\nconst nonce = await account.getNonce();\nconst historicalNonce = await account.getNonce('latest');\n```",name:"getNonce",required:!0,type:{name:"(blockIdentifier?: BlockIdentifier | undefined) => Promise<string>"}},declareIfNot:{defaultValue:null,description:`Declare a contract class if not already declared
@param contractPayload - Contract declaration payload
@param transactionsDetail - Transaction execution options
@returns Declaration result (with empty transaction_hash if already declared)
@example \`\`\`typescript
const result = await account.declareIfNot({
  contract: compiledContract,
  casm: compiledCasm
});
\`\`\``,name:"declareIfNot",required:!0,type:{name:"(contractPayload: DeclareContractPayload, transactionsDetail?: InvocationsDetails | undefined) => Promise<{ transaction_hash: string; class_hash: string; }>"}},channel:{defaultValue:null,description:"",name:"channel",required:!0,type:{name:"RpcChannel$1 | RpcChannel"}},responseParser:{defaultValue:null,description:"",name:"responseParser",required:!0,type:{name:"RPCResponseParser"}},getChainId:{defaultValue:null,description:`Gets the Starknet chain Id
@returns the chain Id`,name:"getChainId",required:!0,type:{name:'() => Promise<"0x534e5f4d41494e" | "0x534e5f5345504f4c4941">'}},callContract:{defaultValue:null,description:`Calls a function on the Starknet contract.
@param call transaction to be called
@param blockIdentifier block identifier
@returns the result of the function on the smart contract.`,name:"callContract",required:!0,type:{name:"(call: Call, blockIdentifier?: BlockIdentifier | undefined) => Promise<CallContractResponse>"}},getBlock:{defaultValue:null,description:`Gets the block information
@param blockIdentifier block identifier
@returns the block object`,name:"getBlock",required:!0,type:{name:'{ (): Promise<{ transactions: string[]; parent_hash: string; timestamp: number; sequencer_address: string; l1_gas_price: RESOURCE_PRICE; l2_gas_price: RESOURCE_PRICE; l1_data_gas_price: RESOURCE_PRICE; l1_da_mode: L1_DA_MODE; starknet_version: string; }>; (blockIdentifier: "pre_confirmed"): Promise<...>; (blockIdent...'}},getClassAt:{defaultValue:null,description:`Gets the contract class of the deployed contract.
@param contractAddress - contract address
@param blockIdentifier - block identifier
@returns Contract class of compiled contract`,name:"getClassAt",required:!0,type:{name:"(contractAddress: BigNumberish, blockIdentifier?: BlockIdentifier | undefined) => Promise<ContractClassResponse>"}},getL1GasPrice:{defaultValue:null,description:`Gets the price of l1 gas in the block
@param blockIdentifier block identifier
@returns gas price of the block`,name:"getL1GasPrice",required:!0,type:{name:"(blockIdentifier?: BlockIdentifier | undefined) => Promise<string>"}},getL1MessageHash:{defaultValue:null,description:`Get L1 message hash from L2 transaction hash
@param l2TxHash L2 transaction hash
@returns Hex string of L1 message hash
@example In Sepolia Testnet :
\`\`\`typescript
const result = provider.getL1MessageHash('0x28dfc05eb4f261b37ddad451ff22f1d08d4e3c24dc646af0ec69fa20e096819');
// result = '0x55b3f8b6e607fffd9b4d843dfe8f9b5c05822cd94fcad8797deb01d77805532a'
\`\`\``,name:"getL1MessageHash",required:!0,type:{name:"(l2TxHash: BigNumberish) => Promise<string>"}},getClassHashAt:{defaultValue:null,description:`Returns the contract class hash in the given block for the contract deployed at the given address
@param contractAddress - contract address
@param blockIdentifier - block identifier
@returns Class hash`,name:"getClassHashAt",required:!0,type:{name:"(contractAddress: BigNumberish, blockIdentifier?: BlockIdentifier | undefined) => Promise<string>"}},getClassByHash:{defaultValue:null,description:`Returns the contract class deployed under the given class hash.
@param classHash - class hash
@returns Contract class of compiled contract`,name:"getClassByHash",required:!0,type:{name:"(classHash: BigNumberish) => Promise<ContractClassResponse>"}},getNonceForAddress:{defaultValue:null,description:`Returns the nonce associated with the given address in the given block
@param contractAddress - contract address
@returns the hex nonce`,name:"getNonceForAddress",required:!0,type:{name:"(contractAddress: BigNumberish, blockIdentifier?: BlockIdentifier | undefined) => Promise<string>"}},getStorageAt:{defaultValue:null,description:`Get the value of the storage (contract's variable) at the given address and key
@param contractAddress
@param key - from getStorageVarAddress('<STORAGE_VARIABLE_NAME>') (WIP)
@param blockIdentifier - block identifier
@returns the value of the storage variable`,name:"getStorageAt",required:!0,type:{name:"(contractAddress: BigNumberish, key: BigNumberish, blockIdentifier?: BlockIdentifier | undefined) => Promise<string>"}},getTransaction:{defaultValue:null,description:`Gets the transaction information from a tx id.
@param transactionHash
@returns the transaction object \\{ transaction_id, status, transaction, block_number?, block_number?, transaction_index?, transaction_failure_reason? \\}`,name:"getTransaction",required:!0,type:{name:"(transactionHash: BigNumberish) => Promise<TransactionWithHash>"}},getTransactionReceipt:{defaultValue:null,description:`Gets the transaction receipt from a tx hash.
@param transactionHash
@returns the transaction receipt object`,name:"getTransactionReceipt",required:!0,type:{name:"(transactionHash: BigNumberish) => Promise<GetTransactionReceiptResponse>"}},deployAccountContract:{defaultValue:null,description:`Deploys a given compiled Account contract (json) to starknet
@param payload payload to be deployed containing:
- compiled contract code
- constructor calldata
- address salt
@returns a confirmation of sending a transaction on the starknet contract`,name:"deployAccountContract",required:!0,type:{name:"(payload: DeployAccountContractPayload, details: InvocationsDetailsWithNonce) => Promise<DeployContractResponse>"}},invokeFunction:{defaultValue:null,description:`Invokes a function on starknet
@param invocation the invocation object containing:
- contractAddress - the address of the contract
- entrypoint - (optional) the entrypoint of the contract
- calldata - (optional, defaults to []) the calldata
- signature - (optional, defaults to []) the signature
@param details - optional details containing:
- nonce - optional nonce
- version - optional version
- maxFee - optional maxFee
@returns response from addTransaction`,name:"invokeFunction",required:!0,type:{name:"(invocation: Invocation, details: InvocationsDetailsWithNonce) => Promise<{ transaction_hash: string; }>"}},declareContract:{defaultValue:null,description:`Declares a given compiled contract (json) to starknet
@param transaction transaction payload to be deployed containing:
- compiled contract code
- sender address
- signature
@param details Invocation Details containing:
- nonce
- optional version
- optional maxFee
@returns a confirmation of sending a transaction on the starknet contract`,name:"declareContract",required:!0,type:{name:"(transaction: DeclareContractTransaction, details: InvocationsDetailsWithNonce) => Promise<{ transaction_hash: string; class_hash: string; }>"}},getInvokeEstimateFee:{defaultValue:null,description:`Estimates the fee for a given INVOKE transaction
@param invocation the invocation object containing:
- contractAddress - the address of the contract
- entrypoint - (optional) the entrypoint of the contract
- calldata - (optional, defaults to []) the calldata
- signature - (optional, defaults to []) the signature
@param details - optional details containing:
- nonce - optional nonce
- version - optional version
@param blockIdentifier - (optional) block identifier
@param skipValidate - (optional) skip cairo __validate__ method
@returns the estimated fee
@deprecated Consider using getEstimateFeeBulk for multiple transactions
@example \`\`\`typescript
const feeEstimate = await provider.getInvokeEstimateFee(invocation, details);
// Equivalent to:
const [feeEstimate] = await provider.getEstimateFeeBulk([{ type: ETransactionType.INVOKE, ...invocation, ...details }], options);
\`\`\`
@alias getEstimateFeeBulk - This method is an alias that calls getEstimateFeeBulk with a single transaction`,name:"getInvokeEstimateFee",required:!0,type:{name:"(invocation: Invocation, details: InvocationsDetailsWithNonce, blockIdentifier?: BlockIdentifier | undefined, skipValidate?: boolean | undefined) => Promise<...>"}},getDeclareEstimateFee:{defaultValue:null,description:`Estimates the fee for a given DECLARE transaction
@param transaction transaction payload to be declared containing:
- compiled contract code
- sender address
- signature - (defaults to []) the signature
@param details - optional details containing:
- nonce
- version - optional version
- optional maxFee
@param blockIdentifier - (optional) block identifier
@param skipValidate - (optional) skip cairo __validate__ method
@returns the estimated fee
@deprecated Consider using getEstimateFeeBulk for multiple transactions
@example \`\`\`typescript
const feeEstimate = await provider.getDeclareEstimateFee(transaction, details);
// Equivalent to:
const [feeEstimate] = await provider.getEstimateFeeBulk([{ type: ETransactionType.DECLARE, ...transaction, ...details }], options);
\`\`\`
@alias getEstimateFeeBulk - This method is an alias that calls getEstimateFeeBulk with a single transaction`,name:"getDeclareEstimateFee",required:!0,type:{name:"(transaction: DeclareContractTransaction, details: InvocationsDetailsWithNonce, blockIdentifier?: BlockIdentifier | undefined, skipValidate?: boolean | undefined) => Promise<...>"}},getDeployAccountEstimateFee:{defaultValue:null,description:`Estimates the fee for a given DEPLOY_ACCOUNT transaction
@param transaction transaction payload to be deployed containing:
- classHash
- constructorCalldata
- addressSalt
- signature - (defaults to []) the signature
@param details - optional details containing:
- nonce
- version - optional version
- optional maxFee
@param blockIdentifier - (optional) block identifier
@param skipValidate - (optional) skip cairo __validate__ method
@returns the estimated fee
@deprecated Consider using getEstimateFeeBulk for multiple transactions
@example \`\`\`typescript
const feeEstimate = await provider.getDeployAccountEstimateFee(transaction, details);
// Equivalent to:
const [feeEstimate] = await provider.getEstimateFeeBulk([{ type: ETransactionType.DEPLOY_ACCOUNT, ...transaction, ...details }], options);
\`\`\`
@alias getEstimateFeeBulk - This method is an alias that calls getEstimateFeeBulk with a single transaction`,name:"getDeployAccountEstimateFee",required:!0,type:{name:"(transaction: DeployAccountContractTransaction, details: InvocationsDetailsWithNonce, blockIdentifier?: BlockIdentifier | undefined, skipValidate?: boolean | undefined) => Promise<...>"}},getEstimateFeeBulk:{defaultValue:null,description:`Estimates the fee for a list of INVOKE transaction
@param invocations AccountInvocations - Complete invocations array with account details
@param options getEstimateFeeBulkOptions
- (optional) blockIdentifier - BlockIdentifier
@returns the estimated fee`,name:"getEstimateFeeBulk",required:!0,type:{name:"(invocations: AccountInvocations, options?: getEstimateFeeBulkOptions | undefined) => Promise<EstimateFeeResponseBulkOverhead>"}},waitForTransaction:{defaultValue:null,description:`Wait for the transaction to be accepted
@param txHash - transaction hash
@param options waitForTransactionOptions
- (optional) retryInterval: number | undefined;
- (optional) successStates: TransactionStatus[] | undefined;
@return GetTransactionReceiptResponse`,name:"waitForTransaction",required:!0,type:{name:"(txHash: BigNumberish, options?: waitForTransactionOptions | undefined) => Promise<GetTransactionReceiptResponse>"}},getSimulateTransaction:{defaultValue:null,description:`Simulates the transaction and returns the transaction trace and estimated fee.
@param invocations AccountInvocations - Complete invocations array with account details
@param options - getSimulateTransactionOptions
- (optional) blockIdentifier - block identifier
- (optional) skipValidate - skip cairo __validate__ method
- (optional) skipExecute - skip cairo __execute__ method
@returns an array of transaction trace and estimated fee`,name:"getSimulateTransaction",required:!0,type:{name:"(invocations: AccountInvocations, options?: getSimulateTransactionOptions | undefined) => Promise<SimulateTransactionOverheadResponse>"}},getStateUpdate:{defaultValue:null,description:`Gets the state changes in a specific block (result of executing the requested block)
@param blockIdentifier - block identifier
@returns StateUpdateResponse`,name:"getStateUpdate",required:!0,type:{name:"(blockIdentifier?: BlockIdentifier | undefined) => Promise<StateUpdateResponse>"}},getBlockStateUpdate:{defaultValue:null,description:`Gets the state changes in a specific block (result of executing the requested block)
Alternative method name for getStateUpdate with specific overloads
@param blockIdentifier - block identifier
@returns StateUpdateResponse`,name:"getBlockStateUpdate",required:!0,type:{name:"{ (): Promise<{ block_hash: string; new_root: string; old_root: string; state_diff: { storage_diffs: { address: string; storage_entries: { key: string; value: string; }[]; }[]; deprecated_declared_classes: string[]; declared_classes: { ...; }[]; deployed_contracts: { ...; }[]; replaced_classes: { ...; }[]; nonces: {..."}},getContractVersion:{defaultValue:null,description:`Gets the contract version from the provided address
@param contractAddress string
@param classHash undefined
@param options - getContractVersionOptions
- (optional) compiler - (default true) extract compiler version using type tactic from abi
- (optional) blockIdentifier - block identifier
@param contractAddress undefined
@param classHash
@param options - getContractVersionOptions
- (optional) compiler - (default true) extract compiler version using type tactic from abi
- (optional) blockIdentifier - block identifier`,name:"getContractVersion",required:!0,type:{name:"{ (contractAddress: BigNumberish, classHash?: undefined, options?: getContractVersionOptions | undefined): Promise<ContractVersion>; (contractAddress: undefined, classHash: BigNumberish, options?: getContractVersionOptions | undefined): Promise<...>; }"}},getBlockLatestAccepted:{defaultValue:null,description:`Get the most recent accepted block hash and number
@returns Object containing block hash and number`,name:"getBlockLatestAccepted",required:!0,type:{name:"() => Promise<{ block_hash: string; block_number: number; }>"}},getBlockNumber:{defaultValue:null,description:`Get the most recent accepted block number
@returns Number of the latest block`,name:"getBlockNumber",required:!0,type:{name:"() => Promise<number>"}},getBlockWithTxHashes:{defaultValue:null,description:`Get block information with transaction hashes
@param blockIdentifier - block identifier
@returns Block with transaction hashes`,name:"getBlockWithTxHashes",required:!0,type:{name:"(blockIdentifier?: BlockIdentifier | undefined) => Promise<any>"}},getBlockWithTxs:{defaultValue:null,description:`Get block information with full transactions
@param blockIdentifier - block identifier
@returns Block with full transactions`,name:"getBlockWithTxs",required:!0,type:{name:"(blockIdentifier?: BlockIdentifier | undefined) => Promise<any>"}},getBlockWithReceipts:{defaultValue:null,description:`Get block information with transaction receipts
@param blockIdentifier - block identifier
@returns Block with transaction receipts`,name:"getBlockWithReceipts",required:!0,type:{name:"(blockIdentifier?: BlockIdentifier | undefined) => Promise<any>"}},getBlockTransactionsTraces:{defaultValue:null,description:`Get transaction traces for all transactions in a block
@param blockIdentifier - block identifier
@returns Array of transaction traces`,name:"getBlockTransactionsTraces",required:!0,type:{name:"(blockIdentifier?: BlockIdentifier | undefined) => Promise<any>"}},getBlockTransactionCount:{defaultValue:null,description:`Get the number of transactions in a block
@param blockIdentifier - block identifier
@returns Transaction count`,name:"getBlockTransactionCount",required:!0,type:{name:"(blockIdentifier?: BlockIdentifier | undefined) => Promise<number>"}},waitForBlock:{defaultValue:null,description:"Pause execution until a specified block is created\n@param blockIdentifier - block number or tag\n@param retryInterval - milliseconds between requests (default: 5000)\n@example ```typescript\nawait provider.waitForBlock(12345);\nawait provider.waitForBlock('latest');\n```",name:"waitForBlock",required:!0,type:{name:"(blockIdentifier?: BlockIdentifier | undefined, retryInterval?: number | undefined) => Promise<void>"}},getTransactionByHash:{defaultValue:null,description:`Gets the transaction information from a tx hash (alias for getTransaction)
@param txHash - transaction hash
@returns Transaction information`,name:"getTransactionByHash",required:!0,type:{name:"(txHash: BigNumberish) => Promise<TransactionWithHash>"}},getTransactionByBlockIdAndIndex:{defaultValue:null,description:`Gets transaction by block identifier and index
@param blockIdentifier - block identifier
@param index - transaction index in the block
@returns Transaction information`,name:"getTransactionByBlockIdAndIndex",required:!0,type:{name:"(blockIdentifier: BlockIdentifier, index: number) => Promise<TransactionWithHash>"}},getTransactionTrace:{defaultValue:null,description:`Gets the transaction trace
@param txHash - transaction hash
@returns Transaction trace`,name:"getTransactionTrace",required:!0,type:{name:"(txHash: BigNumberish) => Promise<TRANSACTION_TRACE | TRANSACTION_TRACE>"}},getTransactionStatus:{defaultValue:null,description:`Get the status of a transaction
@param transactionHash - transaction hash
@returns Transaction status`,name:"getTransactionStatus",required:!0,type:{name:"(transactionHash: BigNumberish) => Promise<any>"}},fetch:{defaultValue:null,description:`Direct RPC method call
@param method - RPC method name
@param params - method parameters
@param id - request ID
@returns RPC response`,name:"fetch",required:!0,type:{name:"(method: string, params?: object | undefined, id?: string | number | undefined) => Promise<any>"}},readSpecVersion:{defaultValue:null,description:`Read channel spec version
@returns Spec version string or undefined if not set`,name:"readSpecVersion",required:!0,type:{name:"() => string | undefined"}},getSpecVersion:{defaultValue:null,description:`Get channel spec version
@returns Promise resolving to spec version`,name:"getSpecVersion",required:!0,type:{name:"() => Promise<string>"}},setUpSpecVersion:{defaultValue:null,description:`Setup channel spec version and return it
@returns Promise resolving to spec version`,name:"setUpSpecVersion",required:!0,type:{name:"() => Promise<string>"}},getClass:{defaultValue:null,description:`Get contract class by hash with optional block identifier
@param classHash - class hash
@param blockIdentifier - block identifier
@returns Contract class`,name:"getClass",required:!0,type:{name:"(classHash: BigNumberish, blockIdentifier?: BlockIdentifier | undefined) => Promise<ContractClassResponse>"}},estimateMessageFee:{defaultValue:null,description:`Estimate the fee for a message from L1
@param message - L1 message
@param blockIdentifier - block identifier
@returns Fee estimate`,name:"estimateMessageFee",required:!0,type:{name:"(message: MSG_FROM_L1, blockIdentifier?: BlockIdentifier | undefined) => Promise<FEE_ESTIMATE | MESSAGE_FEE_ESTIMATE>"}},getSyncingStats:{defaultValue:null,description:`Get node synchronization status
@returns Sync status or false if not syncing`,name:"getSyncingStats",required:!0,type:{name:"() => Promise<any>"}},getEvents:{defaultValue:null,description:`Get events matching the given filter
@param eventFilter - event filter
@returns Events and pagination info`,name:"getEvents",required:!0,type:{name:"(eventFilter: EventFilter | EventFilter) => Promise<EVENTS_CHUNK | EVENTS_CHUNK>"}},verifyMessageInStarknet:{defaultValue:null,description:`Verify in Starknet a signature of a TypedData object or of a given hash.
@param message TypedData object to be verified, or message hash to be verified.
@param signature signature of the message.
@param accountAddress address of the account that has signed the message.
@param signatureVerificationFunctionName if account contract with non standard account verification function name.
@param  : string[]; nokResponse: string[]; error: string[] } [signatureVerificationResponse] if account contract with non standard response of verification function.
@returns \`\`\`typescript
const myTypedMessage: TypedMessage = .... ;
const messageHash = typedData.getMessageHash(myTypedMessage,accountAddress);
const sign: WeierstrassSignatureType = ec.starkCurve.sign(messageHash, privateKey);
const accountAddress = "0x43b7240d227aa2fb8434350b3321c40ac1b88c7067982549e7609870621b535";
const result1 = await myRpcProvider.verifyMessageInStarknet(myTypedMessage, sign, accountAddress);
const result2 = await myRpcProvider.verifyMessageInStarknet(messageHash, sign, accountAddress);
// result1 = result2 = true
\`\`\``,name:"verifyMessageInStarknet",required:!0,type:{name:"(message: BigNumberish | TypedData, signature: Signature, accountAddress: BigNumberish, signatureVerificationFunctionName?: string | undefined, signatureVerificationResponse?: { ...; } | undefined) => Promise<...>"}},isClassDeclared:{defaultValue:null,description:`Test if class is already declared
@param contractClassIdentifier - contract class identifier
@param blockIdentifier - block identifier
@returns true if class is declared`,name:"isClassDeclared",required:!0,type:{name:"(contractClassIdentifier: ContractClassIdentifier, blockIdentifier?: BlockIdentifier | undefined) => Promise<boolean>"}},prepareInvocations:{defaultValue:null,description:`Build bulk invocations with auto-detect declared class
@param invocations - array of invocations
@returns Prepared invocations`,name:"prepareInvocations",required:!0,type:{name:"(invocations: Invocations) => Promise<Invocations>"}},getL1MessagesStatus:{defaultValue:null,description:`Get L1 messages status for a transaction
@param transactionHash - L1 transaction hash
@returns L1 message status`,name:"getL1MessagesStatus",required:!0,type:{name:"(transactionHash: BigNumberish) => Promise<L1L2MessagesStatus | L1L2MessagesStatus>"}},getStorageProof:{defaultValue:null,description:`Get Merkle paths in state tries
@param classHashes - class hashes
@param contractAddresses - contract addresses
@param contractsStorageKeys - storage keys
@param blockIdentifier - block identifier
@returns Storage proof`,name:"getStorageProof",required:!0,type:{name:"(classHashes: BigNumberish[], contractAddresses: BigNumberish[], contractsStorageKeys: CONTRACT_STORAGE_KEYS[], blockIdentifier?: BlockIdentifier | undefined) => Promise<...>"}},getCompiledCasm:{defaultValue:null,description:`Get compiled CASM contract class
@param classHash - class hash
@returns Compiled CASM contract class`,name:"getCompiledCasm",required:!0,type:{name:"(classHash: BigNumberish) => Promise<CASM_COMPILED_CONTRACT_CLASS>"}},getEstimateTip:{defaultValue:null,description:`Get transaction tip estimation based on network analysis
@param blockIdentifier - block identifier to analyze from
@param options - tip analysis options
@returns Tip estimation with statistics
@example \`\`\`typescript
const tipEstimate = await provider.getEstimateTip('latest', {
  maxBlocks: 10,
  minTxsNecessary: 5
});
console.log('Recommended tip:', tipEstimate.recommendedTip);
\`\`\``,name:"getEstimateTip",required:!0,type:{name:"(blockIdentifier?: BlockIdentifier | undefined, options?: TipAnalysisOptions | undefined) => Promise<TipEstimate>"}}}}}catch{}const ye=e=>{const{selectedToken:t}=ke(),{data:r}=be(),n=ne(e),a=re(e),i=t?.address?.toLowerCase(),s=G.toLowerCase(),c=i===s||t?.symbol?.toUpperCase?.()==="STRK",p=!!i&&!!r?.some(d=>(d?.token_address||"")?.toLowerCase()===i),m=!c&&p,f=m?a:n;return async d=>(console.log("SmartTransactor executing with tx:",d),console.log("Using transactor type:",m?"paymaster":"regular"),await f(d))};try{ye.displayName="useSmartTransactor",ye.__docgenInfo={description:`Smart transactor that automatically chooses between regular and paymaster transactions
based on the selected gas token in the context.

- Uses paymaster when non-STRK token is selected
- Falls back to regular transactor when STRK is selected`,displayName:"useSmartTransactor",props:{address:{defaultValue:null,description:"The address of the account contract on Starknet",name:"address",required:!0,type:{name:"string"}},signer:{defaultValue:null,description:"Signer instance for signing transactions and messages",name:"signer",required:!0,type:{name:"SignerInterface"}},cairoVersion:{defaultValue:null,description:"Cairo version of the account contract implementation",name:"cairoVersion",required:!0,type:{name:"enum",value:[{value:"undefined"},{value:'"0"'},{value:'"1"'}]}},deployer:{defaultValue:{value:"Uses default UDC (Universal Deployer Contract) if not specified"},description:"Optional deployer instance for custom contract deployment logic",name:"deployer",required:!1,type:{name:"DeployerInterface"}},estimateInvokeFee:{defaultValue:null,description:`Estimate fee for executing an INVOKE transaction on Starknet
@param calls - Single call or array of calls to estimate fees for
@param calls.contractAddress - The address of the contract to invoke
@param calls.entrypoint - The function selector of the contract method
@param calls.calldata - The serialized function parameters (defaults to [])
@param estimateFeeDetails - Optional details for fee estimation
@param estimateFeeDetails.blockIdentifier - Block to estimate against
@param estimateFeeDetails.nonce - Account nonce (defaults to current nonce)
@param estimateFeeDetails.skipValidate - Skip account validation (default: true)
@param estimateFeeDetails.tip - Priority fee tip in fri/wei for faster inclusion
@param estimateFeeDetails.accountDeploymentData - Include account deployment
@param estimateFeeDetails.paymasterData - Paymaster sponsorship data
@param estimateFeeDetails.nonceDataAvailabilityMode - DA mode for nonce
@param estimateFeeDetails.feeDataAvailabilityMode - DA mode for fee
@param estimateFeeDetails.version - Transaction version (v3 uses fri, v1/v2 use wei)
@param estimateFeeDetails.resourceBounds - Resource limits for v3 transactions
@returns Fee estimation including overall_fee and resourceBounds
@example \`\`\`typescript
const fee = await account.estimateInvokeFee({
  contractAddress: '0x123...',
  entrypoint: 'transfer',
  calldata: [recipient, amount]
});
\`\`\``,name:"estimateInvokeFee",required:!0,type:{name:"(calls: AllowArray<Call>, estimateFeeDetails?: UniversalDetails | undefined) => Promise<EstimateFeeResponseOverhead>"}},estimateDeclareFee:{defaultValue:null,description:`Estimate fee for executing a DECLARE transaction on Starknet
@param contractPayload - Contract declaration payload
@param contractPayload.contract - Compiled contract (Sierra JSON)
@param contractPayload.casm - Compiled Cairo assembly (required for Cairo 1)
@param contractPayload.classHash - Pre-computed class hash (optional optimization)
@param contractPayload.compiledClassHash - Pre-computed CASM hash (alternative to casm)
@param estimateFeeDetails - Optional details for fee estimation
@param estimateFeeDetails.blockIdentifier - Block to estimate against
@param estimateFeeDetails.nonce - Account nonce (defaults to current nonce)
@param estimateFeeDetails.skipValidate - Skip account validation (default: true)
@param estimateFeeDetails.tip - Priority fee tip for faster inclusion
@param estimateFeeDetails.version - Transaction version (v3 uses fri, v1/v2 use wei)
@returns Fee estimation including overall_fee and resourceBounds
@example \`\`\`typescript
const fee = await account.estimateDeclareFee({
  contract: compiledContract,
  casm: compiledCasm
});
\`\`\``,name:"estimateDeclareFee",required:!0,type:{name:"(contractPayload: DeclareContractPayload, estimateFeeDetails?: UniversalDetails | undefined) => Promise<EstimateFeeResponseOverhead>"}},estimateAccountDeployFee:{defaultValue:null,description:`Estimate fee for executing a DEPLOY_ACCOUNT transaction on StarknetestimateInvokeFee
@param contractPayload - Account deployment payload
@param contractPayload.classHash - Class hash of the account contract
@param contractPayload.constructorCalldata - Constructor parameters
@param contractPayload.contractAddress - Pre-computed account address
@param contractPayload.addressSalt - Salt for address generation
@param estimateFeeDetails - Optional details for fee estimation
@inheritdoc estimateInvokeFee
@returns Fee estimation including overall_fee and resourceBounds
@example \`\`\`typescript
const fee = await account.estimateAccountDeployFee({
  classHash: accountClassHash,
  constructorCalldata: { publicKey },
  addressSalt: publicKey
});
\`\`\``,name:"estimateAccountDeployFee",required:!0,type:{name:"(contractPayload: DeployAccountContractPayload, estimateFeeDetails?: UniversalDetails | undefined) => Promise<EstimateFeeResponseOverhead>"}},estimateDeployFee:{defaultValue:null,description:`Estimate fee for deploying contract(s) through the Universal Deployer Contract (UDC)estimateInvokeFee
@param deployContractPayload - Single or array of deployment payloads
@param deployContractPayload.classHash - Class hash of contract to deploy
@param deployContractPayload.salt - Deployment salt (optional)
@param deployContractPayload.unique - Ensure unique deployment address
@param deployContractPayload.constructorCalldata - Constructor parameters
@param estimateFeeDetails - Optional details for fee estimation
@inheritdoc estimateInvokeFee
@returns Fee estimation for the deployment transaction
@example \`\`\`typescript
const fee = await account.estimateDeployFee({
  classHash: contractClassHash,
  constructorCalldata: [param1, param2],
  unique: true
});
\`\`\``,name:"estimateDeployFee",required:!0,type:{name:"(deployContractPayload: UniversalDeployerContractPayload | UniversalDeployerContractPayload[], estimateFeeDetails?: UniversalDetails | undefined) => Promise<...>"}},estimateFeeBulk:{defaultValue:null,description:`Estimate fees for executing multiple transactions in a single requestestimateInvokeFee
@param invocations - Array of transactions to estimate
@param invocations.type - Transaction type: DECLARE, DEPLOY, INVOKE, DEPLOY_ACCOUNT
@param invocations.payload - Transaction-specific payload
@param details - Optional details for fee estimation
@inheritdoc estimateInvokeFee
@returns Array of fee estimations for each transaction
@example \`\`\`typescript
const fees = await account.estimateFeeBulk([
  { type: 'INVOKE', payload: { contractAddress, entrypoint, calldata } },
  { type: 'DECLARE', payload: { contract, casm } }
]);
\`\`\``,name:"estimateFeeBulk",required:!0,type:{name:"(invocations: Invocations, details?: UniversalDetails | undefined) => Promise<EstimateFeeResponseBulkOverhead>"}},execute:{defaultValue:null,description:`Execute one or multiple calls through the account contract
@param transactions - Single call or array of calls to execute
@param transactions.contractAddress - Target contract address
@param transactions.entrypoint - Function to invoke on the contract
@param transactions.calldata - Function parameters
@param transactionsDetail - Transaction execution options
@param transactionsDetail.nonce - Override account nonce
@param transactionsDetail.maxFee - Maximum fee for v1/v2 transactions
@param transactionsDetail.resourceBounds - Resource limits for v3 transactions
@param transactionsDetail.tip - Priority fee tip
@param transactionsDetail.version - Force specific transaction version
@returns Transaction hash and response
@example \`\`\`typescript
const result = await account.execute([
  { contractAddress: token, entrypoint: 'transfer', calldata: [to, amount] },
  { contractAddress: nft, entrypoint: 'mint', calldata: [recipient] }
]);
\`\`\``,name:"execute",required:!0,type:{name:"(transactions: AllowArray<Call>, transactionsDetail?: InvocationsDetails | undefined) => Promise<{ transaction_hash: string; }>"}},estimatePaymasterTransactionFee:{defaultValue:null,description:`Estimate fees for a paymaster-sponsored transaction
@param calls - Array of calls to be sponsored
@param calls.contractAddress - Target contract address
@param calls.entrypoint - Function to invoke
@param calls.calldata - Function parameters
@param paymasterDetails - Paymaster configuration
@param paymasterDetails.feeMode - Sponsorship mode: 'sponsored' or gas token
@param paymasterDetails.deploymentData - Account deployment data if needed
@param paymasterDetails.timeBounds - Valid execution time window
@returns Fee estimates in both STRK and gas token
@example \`\`\`typescript
const fees = await account.estimatePaymasterTransactionFee(
  [{ contractAddress, entrypoint, calldata }],
  { feeMode: { mode: 'sponsored' } }
);
\`\`\``,name:"estimatePaymasterTransactionFee",required:!0,type:{name:"(calls: Call[], paymasterDetails: PaymasterDetails) => Promise<PaymasterFeeEstimate>"}},buildPaymasterTransaction:{defaultValue:null,description:`Build a transaction for paymaster executionestimatePaymasterTransactionFee
@param calls - Array of calls to be sponsored
@param paymasterDetails - Paymaster configuration
@inheritdoc estimatePaymasterTransactionFee
@returns Prepared transaction with typed data for signing
@example \`\`\`typescript
const prepared = await account.buildPaymasterTransaction(
  calls,
  { feeMode: { mode: 'default', gasToken: ETH_ADDRESS } }
);
\`\`\``,name:"buildPaymasterTransaction",required:!0,type:{name:"(calls: Call[], paymasterDetails: PaymasterDetails) => Promise<PreparedTransaction>"}},executePaymasterTransaction:{defaultValue:null,description:`Execute a paymaster-sponsored transaction
@param calls - Array of calls to execute
@param paymasterDetails - Paymaster configuration
@param paymasterDetails.feeMode - 'sponsored' or gas token payment
@param paymasterDetails.deploymentData - Deploy account if needed
@param paymasterDetails.timeBounds - Execution validity window (UNIX timestamps)
@param maxFeeInGasToken - Maximum acceptable fee in gas token
@returns Transaction hash if successful
@throws {Error} If gas token price exceeds maxFeeInGasToken
@throws {Error} If transaction parameters are modified by paymaster
@example \`\`\`typescript
const txHash = await account.executePaymasterTransaction(
  calls,
  { feeMode: { mode: 'sponsored' }, timeBounds: { executeBefore: Date.now()/1000 + 3600 } },
  maxFeeETH
);
\`\`\``,name:"executePaymasterTransaction",required:!0,type:{name:"(calls: Call[], paymasterDetails: PaymasterDetails, maxFeeInGasToken?: BigNumberish | undefined) => Promise<{ transaction_hash: string; }>"}},declare:{defaultValue:null,description:`Declare a contract class on Starknetexecute
@param contractPayload - Contract declaration payload
@param contractPayload.contract - Compiled Sierra contract
@param contractPayload.classHash - Pre-computed class hash (optional)
@param contractPayload.casm - Compiled CASM (required for Cairo 1)
@param contractPayload.compiledClassHash - Pre-computed CASM hash
@param transactionsDetail - Transaction execution options
@inheritdoc execute
@returns Declaration transaction hash and class hash
@example \`\`\`typescript
const declareResult = await account.declare({
  contract: compiledSierra,
  casm: compiledCasm
});
\`\`\``,name:"declare",required:!0,type:{name:"(contractPayload: DeclareContractPayload, transactionsDetail?: InvocationsDetails | undefined) => Promise<{ transaction_hash: string; class_hash: string; }>"}},deploy:{defaultValue:null,description:`Deploy contract(s) using the Universal Deployer Contract (UDC)execute
@param payload - Single or multiple deployment configurations
@param payload.classHash - Class hash of declared contract
@param payload.constructorCalldata - Constructor parameters
@param payload.salt - Deployment salt (random if not specified)
@param payload.unique - Modify salt for unique address (default: true)
@param details - Transaction execution options
@inheritdoc execute
@returns Deployed contract addresses and transaction hash
@example \`\`\`typescript
const deployment = await account.deploy([
  { classHash: erc20ClassHash, constructorCalldata: [name, symbol] },
  { classHash: nftClassHash, unique: true }
]);
\`\`\``,name:"deploy",required:!0,type:{name:"(payload: UniversalDeployerContractPayload | UniversalDeployerContractPayload[], details?: InvocationsDetails | undefined) => Promise<...>"}},deployContract:{defaultValue:null,description:`Deploy and wait for a contract deployment to completedeploy
@param payload - Deployment configuration(s)
@inheritdoc deploy
@param details - Transaction execution options
@inheritdoc execute
@returns Deployment result with contract address and UDC event details
@remarks This method waits for transaction confirmation before returning
@example \`\`\`typescript
const result = await account.deployContract({
  classHash: contractClassHash,
  constructorCalldata: params
});
console.log('Deployed at:', result.address);
\`\`\``,name:"deployContract",required:!0,type:{name:"(payload: UniversalDeployerContractPayload | UniversalDeployerContractPayload[], details?: InvocationsDetails | undefined) => Promise<...>"}},declareAndDeploy:{defaultValue:null,description:`Declare and deploy a contract in a single methodexecute
@param payload - Combined declare and deploy configuration
@param payload.contract - Compiled Sierra contract
@param payload.casm - Compiled CASM (required for Cairo 1)
@param payload.compiledClassHash - Pre-computed CASM hash
@param payload.classHash - Pre-computed class hash
@param payload.constructorCalldata - Constructor parameters
@param payload.salt - Deployment salt
@param payload.unique - Ensure unique deployment address
@param details - Transaction execution options
@inheritdoc execute
@returns Declaration and deployment results
@remarks - Automatically skips declaration if contract is already declared
- Waits for both transactions to complete
- Does not support batch operations
@example \`\`\`typescript
const result = await account.declareAndDeploy({
  contract: compiledContract,
  casm: compiledCasm,
  constructorCalldata: [param1, param2]
});
\`\`\``,name:"declareAndDeploy",required:!0,type:{name:"(payload: DeclareAndDeployContractPayload, details?: InvocationsDetails | undefined) => Promise<DeclareDeployUDCResponse>"}},deployAccount:{defaultValue:null,description:`Deploy the account contract itself on Starknetexecute
@param contractPayload - Account deployment configuration
@param contractPayload.classHash - Account contract class hash
@param contractPayload.constructorCalldata - Constructor parameters
@param contractPayload.addressSalt - Salt for address generation
@param contractPayload.contractAddress - Pre-computed address
@param transactionsDetail - Transaction execution options
@inheritdoc execute
@returns Deployment transaction hash and contract address
@remarks Used for deploying the account contract when using a pre-funded address
@example \`\`\`typescript
const deployment = await account.deployAccount({
  classHash: accountClassHash,
  constructorCalldata: { publicKey: pubKey },
  addressSalt: pubKey
});
\`\`\``,name:"deployAccount",required:!0,type:{name:"(contractPayload: DeployAccountContractPayload, transactionsDetail?: InvocationsDetails | undefined) => Promise<DeployContractResponse>"}},signMessage:{defaultValue:null,description:`Sign a typed data message for off-chain verification
@param typedData - EIP-712 style typed data structure
@returns Signature array [r, s]
@remarks - Includes domain separation to prevent signature reuse
- Compatible with Starknet's signature verification
- Cannot be used to sign transactions
@example \`\`\`typescript
const signature = await account.signMessage({
  domain: { name: 'MyDapp', chainId: 'SN_MAIN' },
  types: { ... },
  primaryType: 'Message',
  message: { content: 'Hello Starknet!' }
});
\`\`\``,name:"signMessage",required:!0,type:{name:"(typedData: TypedData) => Promise<Signature>"}},hashMessage:{defaultValue:null,description:`Hash a typed data message using Pedersen hash
@param typedData - EIP-712 style typed data structure
@returns Message hash as hex string
@remarks - Uses Pedersen hash function (not Keccak)
- Includes domain separation
- Result can be used for signature verification
@example \`\`\`typescript
const messageHash = await account.hashMessage(typedData);
\`\`\``,name:"hashMessage",required:!0,type:{name:"(typedData: TypedData) => Promise<string>"}},getNonce:{defaultValue:null,description:"Get the current nonce of the account\n@param blockIdentifier - Block to query nonce at (default: 'pending')\n@returns Account nonce as hex string\n@example ```typescript\nconst nonce = await account.getNonce();\nconst historicalNonce = await account.getNonce('latest');\n```",name:"getNonce",required:!0,type:{name:"(blockIdentifier?: BlockIdentifier | undefined) => Promise<string>"}},declareIfNot:{defaultValue:null,description:`Declare a contract class if not already declared
@param contractPayload - Contract declaration payload
@param transactionsDetail - Transaction execution options
@returns Declaration result (with empty transaction_hash if already declared)
@example \`\`\`typescript
const result = await account.declareIfNot({
  contract: compiledContract,
  casm: compiledCasm
});
\`\`\``,name:"declareIfNot",required:!0,type:{name:"(contractPayload: DeclareContractPayload, transactionsDetail?: InvocationsDetails | undefined) => Promise<{ transaction_hash: string; class_hash: string; }>"}},channel:{defaultValue:null,description:"",name:"channel",required:!0,type:{name:"RpcChannel$1 | RpcChannel"}},responseParser:{defaultValue:null,description:"",name:"responseParser",required:!0,type:{name:"RPCResponseParser"}},getChainId:{defaultValue:null,description:`Gets the Starknet chain Id
@returns the chain Id`,name:"getChainId",required:!0,type:{name:'() => Promise<"0x534e5f4d41494e" | "0x534e5f5345504f4c4941">'}},callContract:{defaultValue:null,description:`Calls a function on the Starknet contract.
@param call transaction to be called
@param blockIdentifier block identifier
@returns the result of the function on the smart contract.`,name:"callContract",required:!0,type:{name:"(call: Call, blockIdentifier?: BlockIdentifier | undefined) => Promise<CallContractResponse>"}},getBlock:{defaultValue:null,description:`Gets the block information
@param blockIdentifier block identifier
@returns the block object`,name:"getBlock",required:!0,type:{name:'{ (): Promise<{ transactions: string[]; parent_hash: string; timestamp: number; sequencer_address: string; l1_gas_price: RESOURCE_PRICE; l2_gas_price: RESOURCE_PRICE; l1_data_gas_price: RESOURCE_PRICE; l1_da_mode: L1_DA_MODE; starknet_version: string; }>; (blockIdentifier: "pre_confirmed"): Promise<...>; (blockIdent...'}},getClassAt:{defaultValue:null,description:`Gets the contract class of the deployed contract.
@param contractAddress - contract address
@param blockIdentifier - block identifier
@returns Contract class of compiled contract`,name:"getClassAt",required:!0,type:{name:"(contractAddress: BigNumberish, blockIdentifier?: BlockIdentifier | undefined) => Promise<ContractClassResponse>"}},getL1GasPrice:{defaultValue:null,description:`Gets the price of l1 gas in the block
@param blockIdentifier block identifier
@returns gas price of the block`,name:"getL1GasPrice",required:!0,type:{name:"(blockIdentifier?: BlockIdentifier | undefined) => Promise<string>"}},getL1MessageHash:{defaultValue:null,description:`Get L1 message hash from L2 transaction hash
@param l2TxHash L2 transaction hash
@returns Hex string of L1 message hash
@example In Sepolia Testnet :
\`\`\`typescript
const result = provider.getL1MessageHash('0x28dfc05eb4f261b37ddad451ff22f1d08d4e3c24dc646af0ec69fa20e096819');
// result = '0x55b3f8b6e607fffd9b4d843dfe8f9b5c05822cd94fcad8797deb01d77805532a'
\`\`\``,name:"getL1MessageHash",required:!0,type:{name:"(l2TxHash: BigNumberish) => Promise<string>"}},getClassHashAt:{defaultValue:null,description:`Returns the contract class hash in the given block for the contract deployed at the given address
@param contractAddress - contract address
@param blockIdentifier - block identifier
@returns Class hash`,name:"getClassHashAt",required:!0,type:{name:"(contractAddress: BigNumberish, blockIdentifier?: BlockIdentifier | undefined) => Promise<string>"}},getClassByHash:{defaultValue:null,description:`Returns the contract class deployed under the given class hash.
@param classHash - class hash
@returns Contract class of compiled contract`,name:"getClassByHash",required:!0,type:{name:"(classHash: BigNumberish) => Promise<ContractClassResponse>"}},getNonceForAddress:{defaultValue:null,description:`Returns the nonce associated with the given address in the given block
@param contractAddress - contract address
@returns the hex nonce`,name:"getNonceForAddress",required:!0,type:{name:"(contractAddress: BigNumberish, blockIdentifier?: BlockIdentifier | undefined) => Promise<string>"}},getStorageAt:{defaultValue:null,description:`Get the value of the storage (contract's variable) at the given address and key
@param contractAddress
@param key - from getStorageVarAddress('<STORAGE_VARIABLE_NAME>') (WIP)
@param blockIdentifier - block identifier
@returns the value of the storage variable`,name:"getStorageAt",required:!0,type:{name:"(contractAddress: BigNumberish, key: BigNumberish, blockIdentifier?: BlockIdentifier | undefined) => Promise<string>"}},getTransaction:{defaultValue:null,description:`Gets the transaction information from a tx id.
@param transactionHash
@returns the transaction object \\{ transaction_id, status, transaction, block_number?, block_number?, transaction_index?, transaction_failure_reason? \\}`,name:"getTransaction",required:!0,type:{name:"(transactionHash: BigNumberish) => Promise<TransactionWithHash>"}},getTransactionReceipt:{defaultValue:null,description:`Gets the transaction receipt from a tx hash.
@param transactionHash
@returns the transaction receipt object`,name:"getTransactionReceipt",required:!0,type:{name:"(transactionHash: BigNumberish) => Promise<GetTransactionReceiptResponse>"}},deployAccountContract:{defaultValue:null,description:`Deploys a given compiled Account contract (json) to starknet
@param payload payload to be deployed containing:
- compiled contract code
- constructor calldata
- address salt
@returns a confirmation of sending a transaction on the starknet contract`,name:"deployAccountContract",required:!0,type:{name:"(payload: DeployAccountContractPayload, details: InvocationsDetailsWithNonce) => Promise<DeployContractResponse>"}},invokeFunction:{defaultValue:null,description:`Invokes a function on starknet
@param invocation the invocation object containing:
- contractAddress - the address of the contract
- entrypoint - (optional) the entrypoint of the contract
- calldata - (optional, defaults to []) the calldata
- signature - (optional, defaults to []) the signature
@param details - optional details containing:
- nonce - optional nonce
- version - optional version
- maxFee - optional maxFee
@returns response from addTransaction`,name:"invokeFunction",required:!0,type:{name:"(invocation: Invocation, details: InvocationsDetailsWithNonce) => Promise<{ transaction_hash: string; }>"}},declareContract:{defaultValue:null,description:`Declares a given compiled contract (json) to starknet
@param transaction transaction payload to be deployed containing:
- compiled contract code
- sender address
- signature
@param details Invocation Details containing:
- nonce
- optional version
- optional maxFee
@returns a confirmation of sending a transaction on the starknet contract`,name:"declareContract",required:!0,type:{name:"(transaction: DeclareContractTransaction, details: InvocationsDetailsWithNonce) => Promise<{ transaction_hash: string; class_hash: string; }>"}},getInvokeEstimateFee:{defaultValue:null,description:`Estimates the fee for a given INVOKE transaction
@param invocation the invocation object containing:
- contractAddress - the address of the contract
- entrypoint - (optional) the entrypoint of the contract
- calldata - (optional, defaults to []) the calldata
- signature - (optional, defaults to []) the signature
@param details - optional details containing:
- nonce - optional nonce
- version - optional version
@param blockIdentifier - (optional) block identifier
@param skipValidate - (optional) skip cairo __validate__ method
@returns the estimated fee
@deprecated Consider using getEstimateFeeBulk for multiple transactions
@example \`\`\`typescript
const feeEstimate = await provider.getInvokeEstimateFee(invocation, details);
// Equivalent to:
const [feeEstimate] = await provider.getEstimateFeeBulk([{ type: ETransactionType.INVOKE, ...invocation, ...details }], options);
\`\`\`
@alias getEstimateFeeBulk - This method is an alias that calls getEstimateFeeBulk with a single transaction`,name:"getInvokeEstimateFee",required:!0,type:{name:"(invocation: Invocation, details: InvocationsDetailsWithNonce, blockIdentifier?: BlockIdentifier | undefined, skipValidate?: boolean | undefined) => Promise<...>"}},getDeclareEstimateFee:{defaultValue:null,description:`Estimates the fee for a given DECLARE transaction
@param transaction transaction payload to be declared containing:
- compiled contract code
- sender address
- signature - (defaults to []) the signature
@param details - optional details containing:
- nonce
- version - optional version
- optional maxFee
@param blockIdentifier - (optional) block identifier
@param skipValidate - (optional) skip cairo __validate__ method
@returns the estimated fee
@deprecated Consider using getEstimateFeeBulk for multiple transactions
@example \`\`\`typescript
const feeEstimate = await provider.getDeclareEstimateFee(transaction, details);
// Equivalent to:
const [feeEstimate] = await provider.getEstimateFeeBulk([{ type: ETransactionType.DECLARE, ...transaction, ...details }], options);
\`\`\`
@alias getEstimateFeeBulk - This method is an alias that calls getEstimateFeeBulk with a single transaction`,name:"getDeclareEstimateFee",required:!0,type:{name:"(transaction: DeclareContractTransaction, details: InvocationsDetailsWithNonce, blockIdentifier?: BlockIdentifier | undefined, skipValidate?: boolean | undefined) => Promise<...>"}},getDeployAccountEstimateFee:{defaultValue:null,description:`Estimates the fee for a given DEPLOY_ACCOUNT transaction
@param transaction transaction payload to be deployed containing:
- classHash
- constructorCalldata
- addressSalt
- signature - (defaults to []) the signature
@param details - optional details containing:
- nonce
- version - optional version
- optional maxFee
@param blockIdentifier - (optional) block identifier
@param skipValidate - (optional) skip cairo __validate__ method
@returns the estimated fee
@deprecated Consider using getEstimateFeeBulk for multiple transactions
@example \`\`\`typescript
const feeEstimate = await provider.getDeployAccountEstimateFee(transaction, details);
// Equivalent to:
const [feeEstimate] = await provider.getEstimateFeeBulk([{ type: ETransactionType.DEPLOY_ACCOUNT, ...transaction, ...details }], options);
\`\`\`
@alias getEstimateFeeBulk - This method is an alias that calls getEstimateFeeBulk with a single transaction`,name:"getDeployAccountEstimateFee",required:!0,type:{name:"(transaction: DeployAccountContractTransaction, details: InvocationsDetailsWithNonce, blockIdentifier?: BlockIdentifier | undefined, skipValidate?: boolean | undefined) => Promise<...>"}},getEstimateFeeBulk:{defaultValue:null,description:`Estimates the fee for a list of INVOKE transaction
@param invocations AccountInvocations - Complete invocations array with account details
@param options getEstimateFeeBulkOptions
- (optional) blockIdentifier - BlockIdentifier
@returns the estimated fee`,name:"getEstimateFeeBulk",required:!0,type:{name:"(invocations: AccountInvocations, options?: getEstimateFeeBulkOptions | undefined) => Promise<EstimateFeeResponseBulkOverhead>"}},waitForTransaction:{defaultValue:null,description:`Wait for the transaction to be accepted
@param txHash - transaction hash
@param options waitForTransactionOptions
- (optional) retryInterval: number | undefined;
- (optional) successStates: TransactionStatus[] | undefined;
@return GetTransactionReceiptResponse`,name:"waitForTransaction",required:!0,type:{name:"(txHash: BigNumberish, options?: waitForTransactionOptions | undefined) => Promise<GetTransactionReceiptResponse>"}},getSimulateTransaction:{defaultValue:null,description:`Simulates the transaction and returns the transaction trace and estimated fee.
@param invocations AccountInvocations - Complete invocations array with account details
@param options - getSimulateTransactionOptions
- (optional) blockIdentifier - block identifier
- (optional) skipValidate - skip cairo __validate__ method
- (optional) skipExecute - skip cairo __execute__ method
@returns an array of transaction trace and estimated fee`,name:"getSimulateTransaction",required:!0,type:{name:"(invocations: AccountInvocations, options?: getSimulateTransactionOptions | undefined) => Promise<SimulateTransactionOverheadResponse>"}},getStateUpdate:{defaultValue:null,description:`Gets the state changes in a specific block (result of executing the requested block)
@param blockIdentifier - block identifier
@returns StateUpdateResponse`,name:"getStateUpdate",required:!0,type:{name:"(blockIdentifier?: BlockIdentifier | undefined) => Promise<StateUpdateResponse>"}},getBlockStateUpdate:{defaultValue:null,description:`Gets the state changes in a specific block (result of executing the requested block)
Alternative method name for getStateUpdate with specific overloads
@param blockIdentifier - block identifier
@returns StateUpdateResponse`,name:"getBlockStateUpdate",required:!0,type:{name:"{ (): Promise<{ block_hash: string; new_root: string; old_root: string; state_diff: { storage_diffs: { address: string; storage_entries: { key: string; value: string; }[]; }[]; deprecated_declared_classes: string[]; declared_classes: { ...; }[]; deployed_contracts: { ...; }[]; replaced_classes: { ...; }[]; nonces: {..."}},getContractVersion:{defaultValue:null,description:`Gets the contract version from the provided address
@param contractAddress string
@param classHash undefined
@param options - getContractVersionOptions
- (optional) compiler - (default true) extract compiler version using type tactic from abi
- (optional) blockIdentifier - block identifier
@param contractAddress undefined
@param classHash
@param options - getContractVersionOptions
- (optional) compiler - (default true) extract compiler version using type tactic from abi
- (optional) blockIdentifier - block identifier`,name:"getContractVersion",required:!0,type:{name:"{ (contractAddress: BigNumberish, classHash?: undefined, options?: getContractVersionOptions | undefined): Promise<ContractVersion>; (contractAddress: undefined, classHash: BigNumberish, options?: getContractVersionOptions | undefined): Promise<...>; }"}},getBlockLatestAccepted:{defaultValue:null,description:`Get the most recent accepted block hash and number
@returns Object containing block hash and number`,name:"getBlockLatestAccepted",required:!0,type:{name:"() => Promise<{ block_hash: string; block_number: number; }>"}},getBlockNumber:{defaultValue:null,description:`Get the most recent accepted block number
@returns Number of the latest block`,name:"getBlockNumber",required:!0,type:{name:"() => Promise<number>"}},getBlockWithTxHashes:{defaultValue:null,description:`Get block information with transaction hashes
@param blockIdentifier - block identifier
@returns Block with transaction hashes`,name:"getBlockWithTxHashes",required:!0,type:{name:"(blockIdentifier?: BlockIdentifier | undefined) => Promise<any>"}},getBlockWithTxs:{defaultValue:null,description:`Get block information with full transactions
@param blockIdentifier - block identifier
@returns Block with full transactions`,name:"getBlockWithTxs",required:!0,type:{name:"(blockIdentifier?: BlockIdentifier | undefined) => Promise<any>"}},getBlockWithReceipts:{defaultValue:null,description:`Get block information with transaction receipts
@param blockIdentifier - block identifier
@returns Block with transaction receipts`,name:"getBlockWithReceipts",required:!0,type:{name:"(blockIdentifier?: BlockIdentifier | undefined) => Promise<any>"}},getBlockTransactionsTraces:{defaultValue:null,description:`Get transaction traces for all transactions in a block
@param blockIdentifier - block identifier
@returns Array of transaction traces`,name:"getBlockTransactionsTraces",required:!0,type:{name:"(blockIdentifier?: BlockIdentifier | undefined) => Promise<any>"}},getBlockTransactionCount:{defaultValue:null,description:`Get the number of transactions in a block
@param blockIdentifier - block identifier
@returns Transaction count`,name:"getBlockTransactionCount",required:!0,type:{name:"(blockIdentifier?: BlockIdentifier | undefined) => Promise<number>"}},waitForBlock:{defaultValue:null,description:"Pause execution until a specified block is created\n@param blockIdentifier - block number or tag\n@param retryInterval - milliseconds between requests (default: 5000)\n@example ```typescript\nawait provider.waitForBlock(12345);\nawait provider.waitForBlock('latest');\n```",name:"waitForBlock",required:!0,type:{name:"(blockIdentifier?: BlockIdentifier | undefined, retryInterval?: number | undefined) => Promise<void>"}},getTransactionByHash:{defaultValue:null,description:`Gets the transaction information from a tx hash (alias for getTransaction)
@param txHash - transaction hash
@returns Transaction information`,name:"getTransactionByHash",required:!0,type:{name:"(txHash: BigNumberish) => Promise<TransactionWithHash>"}},getTransactionByBlockIdAndIndex:{defaultValue:null,description:`Gets transaction by block identifier and index
@param blockIdentifier - block identifier
@param index - transaction index in the block
@returns Transaction information`,name:"getTransactionByBlockIdAndIndex",required:!0,type:{name:"(blockIdentifier: BlockIdentifier, index: number) => Promise<TransactionWithHash>"}},getTransactionTrace:{defaultValue:null,description:`Gets the transaction trace
@param txHash - transaction hash
@returns Transaction trace`,name:"getTransactionTrace",required:!0,type:{name:"(txHash: BigNumberish) => Promise<TRANSACTION_TRACE | TRANSACTION_TRACE>"}},getTransactionStatus:{defaultValue:null,description:`Get the status of a transaction
@param transactionHash - transaction hash
@returns Transaction status`,name:"getTransactionStatus",required:!0,type:{name:"(transactionHash: BigNumberish) => Promise<any>"}},fetch:{defaultValue:null,description:`Direct RPC method call
@param method - RPC method name
@param params - method parameters
@param id - request ID
@returns RPC response`,name:"fetch",required:!0,type:{name:"(method: string, params?: object | undefined, id?: string | number | undefined) => Promise<any>"}},readSpecVersion:{defaultValue:null,description:`Read channel spec version
@returns Spec version string or undefined if not set`,name:"readSpecVersion",required:!0,type:{name:"() => string | undefined"}},getSpecVersion:{defaultValue:null,description:`Get channel spec version
@returns Promise resolving to spec version`,name:"getSpecVersion",required:!0,type:{name:"() => Promise<string>"}},setUpSpecVersion:{defaultValue:null,description:`Setup channel spec version and return it
@returns Promise resolving to spec version`,name:"setUpSpecVersion",required:!0,type:{name:"() => Promise<string>"}},getClass:{defaultValue:null,description:`Get contract class by hash with optional block identifier
@param classHash - class hash
@param blockIdentifier - block identifier
@returns Contract class`,name:"getClass",required:!0,type:{name:"(classHash: BigNumberish, blockIdentifier?: BlockIdentifier | undefined) => Promise<ContractClassResponse>"}},estimateMessageFee:{defaultValue:null,description:`Estimate the fee for a message from L1
@param message - L1 message
@param blockIdentifier - block identifier
@returns Fee estimate`,name:"estimateMessageFee",required:!0,type:{name:"(message: MSG_FROM_L1, blockIdentifier?: BlockIdentifier | undefined) => Promise<FEE_ESTIMATE | MESSAGE_FEE_ESTIMATE>"}},getSyncingStats:{defaultValue:null,description:`Get node synchronization status
@returns Sync status or false if not syncing`,name:"getSyncingStats",required:!0,type:{name:"() => Promise<any>"}},getEvents:{defaultValue:null,description:`Get events matching the given filter
@param eventFilter - event filter
@returns Events and pagination info`,name:"getEvents",required:!0,type:{name:"(eventFilter: EventFilter | EventFilter) => Promise<EVENTS_CHUNK | EVENTS_CHUNK>"}},verifyMessageInStarknet:{defaultValue:null,description:`Verify in Starknet a signature of a TypedData object or of a given hash.
@param message TypedData object to be verified, or message hash to be verified.
@param signature signature of the message.
@param accountAddress address of the account that has signed the message.
@param signatureVerificationFunctionName if account contract with non standard account verification function name.
@param  : string[]; nokResponse: string[]; error: string[] } [signatureVerificationResponse] if account contract with non standard response of verification function.
@returns \`\`\`typescript
const myTypedMessage: TypedMessage = .... ;
const messageHash = typedData.getMessageHash(myTypedMessage,accountAddress);
const sign: WeierstrassSignatureType = ec.starkCurve.sign(messageHash, privateKey);
const accountAddress = "0x43b7240d227aa2fb8434350b3321c40ac1b88c7067982549e7609870621b535";
const result1 = await myRpcProvider.verifyMessageInStarknet(myTypedMessage, sign, accountAddress);
const result2 = await myRpcProvider.verifyMessageInStarknet(messageHash, sign, accountAddress);
// result1 = result2 = true
\`\`\``,name:"verifyMessageInStarknet",required:!0,type:{name:"(message: BigNumberish | TypedData, signature: Signature, accountAddress: BigNumberish, signatureVerificationFunctionName?: string | undefined, signatureVerificationResponse?: { ...; } | undefined) => Promise<...>"}},isClassDeclared:{defaultValue:null,description:`Test if class is already declared
@param contractClassIdentifier - contract class identifier
@param blockIdentifier - block identifier
@returns true if class is declared`,name:"isClassDeclared",required:!0,type:{name:"(contractClassIdentifier: ContractClassIdentifier, blockIdentifier?: BlockIdentifier | undefined) => Promise<boolean>"}},prepareInvocations:{defaultValue:null,description:`Build bulk invocations with auto-detect declared class
@param invocations - array of invocations
@returns Prepared invocations`,name:"prepareInvocations",required:!0,type:{name:"(invocations: Invocations) => Promise<Invocations>"}},getL1MessagesStatus:{defaultValue:null,description:`Get L1 messages status for a transaction
@param transactionHash - L1 transaction hash
@returns L1 message status`,name:"getL1MessagesStatus",required:!0,type:{name:"(transactionHash: BigNumberish) => Promise<L1L2MessagesStatus | L1L2MessagesStatus>"}},getStorageProof:{defaultValue:null,description:`Get Merkle paths in state tries
@param classHashes - class hashes
@param contractAddresses - contract addresses
@param contractsStorageKeys - storage keys
@param blockIdentifier - block identifier
@returns Storage proof`,name:"getStorageProof",required:!0,type:{name:"(classHashes: BigNumberish[], contractAddresses: BigNumberish[], contractsStorageKeys: CONTRACT_STORAGE_KEYS[], blockIdentifier?: BlockIdentifier | undefined) => Promise<...>"}},getCompiledCasm:{defaultValue:null,description:`Get compiled CASM contract class
@param classHash - class hash
@returns Compiled CASM contract class`,name:"getCompiledCasm",required:!0,type:{name:"(classHash: BigNumberish) => Promise<CASM_COMPILED_CONTRACT_CLASS>"}},getEstimateTip:{defaultValue:null,description:`Get transaction tip estimation based on network analysis
@param blockIdentifier - block identifier to analyze from
@param options - tip analysis options
@returns Tip estimation with statistics
@example \`\`\`typescript
const tipEstimate = await provider.getEstimateTip('latest', {
  maxBlocks: 10,
  minTxsNecessary: 5
});
console.log('Recommended tip:', tipEstimate.recommendedTip);
\`\`\``,name:"getEstimateTip",required:!0,type:{name:"(blockIdentifier?: BlockIdentifier | undefined, options?: TipAnalysisOptions | undefined) => Promise<TipEstimate>"}}}}}catch{}const Je=()=>{const{provider:e}=ge(),{targetNetwork:t}=X(),r=K(a=>a.setSnBlockNumber),n=async()=>{try{const a="getBlockLatestAccepted"in e?await e.getBlockLatestAccepted():await e.getBlock("latest");r(BigInt(a.block_number??a.blockNumber))}catch{r(void 0)}};return y.useEffect(()=>{n()},[e,t.id]),Oe(n,t.id!==Ae.id?j.pollingInterval:4e3),null},he=({children:e})=>D.jsxs(D.Fragment,{children:[e,D.jsx(Je,{})]}),dt=()=>K(e=>e.snBlockNumber);try{he.displayName="StarkBlockNumberProvider",he.__docgenInfo={description:"",displayName:"StarkBlockNumberProvider",props:{}}}catch{}const ut=e=>{const t=e.toString(16).replace(/^0+/,"");return Buffer.from(t,"hex").toString("ascii")},pt=(e,t)=>{try{const r=BigInt(e),n=BigInt(10)**BigInt(t),a=r/n,s=(r%n).toString().padStart(Number(t),"0"),p=`${a}.${s}`.split(".");if(p.length===1)return`${p[0]}.000`;const m=p[1].slice(0,3).padEnd(3,"0");return`${p[0]}.${m}`}catch(r){return console.error("Error formatting token amount:",r),"0.000"}};export{ct as a,lt as b,dt as c,ye as d,pt as e,ut as f,ot as g,X as h,$e as i,L as l,Le as u};
