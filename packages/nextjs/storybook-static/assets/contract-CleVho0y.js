import{r as I}from"./index-Bk_d_yAU.js";import{n as ke,g as D,Q as qe,S as _e,V as Ie,W as Ne,X as Be,Y as z,Z as ae,_ as De,$ as Oe,e as Me,h as Y,L as We,p as me,j as Fe,a0 as pe,m as Le,a1 as $e,a2 as ze,a3 as Ve,a4 as je,k as He,a5 as Ue,a6 as Je,a7 as Ge,K as he,a8 as Ke,J as Qe,a9 as Ye,f as fe,u as X,d as ge,aa as Xe,ab as Ze,ac as et,z as _,ad as tt,w as nt,T as M,O as at,I as se}from"./en_US-YBXRRIY6-ByhZuFgc.js";import{A as F,q as O,y as re,w as R,r as Z,t as we,S as st,T as rt,p as ye,B as Ce,L as it,U as ot,v as L,j as ee,P as be,u as ve,V as ct,s as ut}from"./createSafeContext-Dp97sAkz.js";import{_ as lt}from"./iframe-BtPwi0O8.js";import{j as N}from"./jsx-runtime-CcWEvojh.js";import{u as V}from"./store-CUKCto7f.js";import{a as te,s as Te,w as Ae,b as xe,p as Se,g as dt}from"./prepareAuthorization-7YKPcvtF.js";import{e as ie}from"./externalContracts-_f_8pMJw.js";async function W(e,t){return W.internal(e,te,"sendTransaction",t)}(function(e){async function t(n,a,s,r){const{abi:i,account:c=n.account,address:l,args:o,dataSuffix:u,functionName:h,...f}=r;if(typeof c>"u")throw new F({docsPath:"/docs/contract/writeContract"});const d=c?O(c):null,p=ke({abi:i,args:o,functionName:h});try{return await D(n,a,s)({data:`${p}${u?u.replace("0x",""):""}`,to:l,account:d,...f})}catch(g){throw qe(g,{abi:i,address:l,args:o,docsPath:"/docs/contract/writeContract",functionName:h,sender:d?.address})}}e.internal=t})(W||(W={}));const J=new Map;async function mt(e){const{getSocket:t,keepAlive:n=!0,key:a="socket",reconnect:s=!0,url:r}=e,{interval:i=3e4}=typeof n=="object"?n:{},{attempts:c=5,delay:l=2e3}=typeof s=="object"?s:{},o=JSON.stringify({keepAlive:n,key:a,url:r,reconnect:s});let u=J.get(o);if(u)return u;let h=0;const{schedule:f}=_e({id:o,fn:async()=>{const g=new Map,y=new Map;let C,A,v,b=!1;function k(){if(s&&h<c){if(b)return;b=!0,h++,A?.close(),setTimeout(async()=>{await T().catch(console.error),b=!1},l)}else g.clear(),y.clear()}async function T(){const x=await t({onClose(){for(const w of g.values())w.onError?.(new z({url:r}));for(const w of y.values())w.onError?.(new z({url:r}));k()},onError(w){C=w;for(const S of g.values())S.onError?.(C);for(const S of y.values())S.onError?.(C);k()},onOpen(){C=void 0,h=0},onResponse(w){const S=w.method==="eth_subscription",P=S?w.params.subscription:w.id,q=S?y:g,E=q.get(P);E&&E.onResponse(w),S||q.delete(P)}});if(A=x,n&&(v&&clearInterval(v),v=setInterval(()=>A.ping?.(),i)),s&&y.size>0){const w=y.entries();for(const[S,{onResponse:P,body:q,onError:E}]of w)q&&(y.delete(S),u?.request({body:q,onResponse:P,onError:E}))}return x}return await T(),C=void 0,u={close(){v&&clearInterval(v),A.close(),J.delete(o)},get socket(){return A},request({body:x,onError:w,onResponse:S}){C&&w&&w(C);const P=x.id??Be.take(),q=E=>{typeof E.id=="number"&&P!==E.id||(x.method==="eth_subscribe"&&typeof E.result=="string"&&y.set(E.result,{onResponse:q,onError:w,body:x}),S(E))};x.method==="eth_unsubscribe"&&y.delete(x.params?.[0]),g.set(P,{onResponse:q,onError:w});try{A.request({body:{jsonrpc:"2.0",id:P,...x}})}catch(E){w?.(E)}},requestAsync({body:x,timeout:w=1e4}){return Ie(()=>new Promise((S,P)=>this.request({body:x,onError:P,onResponse:S})),{errorInstance:new Ne({body:x,url:r}),timeout:w})},requests:g,subscriptions:y,url:r},J.set(o,u),[u]}}),[d,[p]]=await f();return p}async function $(e,t={}){const{keepAlive:n,reconnect:a}=t;return mt({async getSocket({onClose:s,onError:r,onOpen:i,onResponse:c}){const l=await lt(()=>import("./native-Bz5QQgeN.js").then(d=>d.n),[],import.meta.url).then(d=>d.WebSocket),o=new l(e);function u(){o.removeEventListener("close",u),o.removeEventListener("message",h),o.removeEventListener("error",r),o.removeEventListener("open",i),s()}function h({data:d}){if(!(typeof d=="string"&&d.trim().length===0))try{const p=JSON.parse(d);c(p)}catch(p){r(p)}}o.addEventListener("close",u),o.addEventListener("message",h),o.addEventListener("error",r),o.addEventListener("open",i),o.readyState===l.CONNECTING&&await new Promise((d,p)=>{o&&(o.onopen=d,o.onerror=p)});const{close:f}=o;return Object.assign(o,{close(){f.bind(o)(),u()},ping(){try{if(o.readyState===o.CLOSED||o.readyState===o.CLOSING)throw new ae({url:o.url,cause:new z({url:o.url})});const d={jsonrpc:"2.0",id:null,method:"net_version",params:[]};o.send(JSON.stringify(d))}catch(d){r(d)}},request({body:d}){if(o.readyState===o.CLOSED||o.readyState===o.CLOSING)throw new ae({body:d,url:o.url,cause:new z({url:o.url})});return o.send(JSON.stringify(d))}})},keepAlive:n,reconnect:a,url:e})}async function pt(e){const t=await $(e);return Object.assign(t.socket,{requests:t.requests,subscriptions:t.subscriptions})}async function ht(e,{hash:t}){await e.request({method:`${e.mode}_dropTransaction`,params:[t]})}async function ft(e){return e.request({method:`${e.mode}_dumpState`})}async function gt(e){return e.mode==="ganache"?await e.request({method:"eth_mining"}):await e.request({method:`${e.mode}_getAutomine`})}async function wt(e){return await e.request({method:"txpool_content"})}async function yt(e){const{pending:t,queued:n}=await e.request({method:"txpool_status"});return{pending:re(t),queued:re(n)}}async function Ct(e,{address:t}){await e.request({method:`${e.mode}_impersonateAccount`,params:[t]})}async function bt(e,{seconds:t}){return await e.request({method:"evm_increaseTime",params:[R(t)]})}async function vt(e){return await e.request({method:"txpool_inspect"})}async function Tt(e,{state:t}){await e.request({method:`${e.mode}_loadState`,params:[t]})}async function At(e,{blocks:t,interval:n}){e.mode==="ganache"?await e.request({method:"evm_mine",params:[{blocks:R(t)}]}):await e.request({method:`${e.mode}_mine`,params:[R(t),R(n||0)]})}async function xt(e){await e.request({method:`${e.mode}_removeBlockTimestampInterval`})}async function St(e,{blockNumber:t,jsonRpcUrl:n}={}){await e.request({method:`${e.mode}_reset`,params:[{forking:{blockNumber:Number(t),jsonRpcUrl:n}}]})}async function Rt(e,{id:t}){await e.request({method:"evm_revert",params:[t]})}async function Et(e,t){const{accessList:n,data:a,from:s,gas:r,gasPrice:i,maxFeePerGas:c,maxPriorityFeePerGas:l,nonce:o,to:u,value:h,...f}=t,d=e.chain?.formatters?.transactionRequest?.format,g=(d||Z)({...we(f,{format:d}),accessList:n,data:a,from:s,gas:r,gasPrice:i,maxFeePerGas:c,maxPriorityFeePerGas:l,nonce:o,to:u,value:h},"sendUnsignedTransaction");return await e.request({method:"eth_sendUnsignedTransaction",params:[g]})}async function Pt(e,t){e.mode==="ganache"?t?await e.request({method:"miner_start"}):await e.request({method:"miner_stop"}):await e.request({method:"evm_setAutomine",params:[t]})}async function kt(e,{address:t,value:n}){e.mode==="ganache"?await e.request({method:"evm_setAccountBalance",params:[t,R(n)]}):await e.request({method:`${e.mode}_setBalance`,params:[t,R(n)]})}async function qt(e,{gasLimit:t}){await e.request({method:"evm_setBlockGasLimit",params:[R(t)]})}async function _t(e,{interval:t}){const n=e.mode==="hardhat"?t*1e3:t;await e.request({method:`${e.mode}_setBlockTimestampInterval`,params:[n]})}async function It(e,{address:t,bytecode:n}){e.mode==="ganache"?await e.request({method:"evm_setAccountCode",params:[t,n]}):await e.request({method:`${e.mode}_setCode`,params:[t,n]})}async function Nt(e,{address:t}){await e.request({method:`${e.mode}_setCoinbase`,params:[t]})}async function Bt(e,{interval:t}){const n=e.mode==="hardhat"?t*1e3:t;await e.request({method:"evm_setIntervalMining",params:[n]})}async function Dt(e,t){await e.request({method:`${e.mode}_setLoggingEnabled`,params:[t]})}async function Ot(e,{gasPrice:t}){await e.request({method:`${e.mode}_setMinGasPrice`,params:[R(t)]})}async function Mt(e,{baseFeePerGas:t}){await e.request({method:`${e.mode}_setNextBlockBaseFeePerGas`,params:[R(t)]})}async function Wt(e,{timestamp:t}){await e.request({method:"evm_setNextBlockTimestamp",params:[R(t)]})}async function Ft(e,{address:t,nonce:n}){await e.request({method:`${e.mode}_setNonce`,params:[t,R(n)]})}async function Lt(e,t){await e.request({method:`${e.mode}_setRpcUrl`,params:[t]})}async function $t(e,{address:t,index:n,value:a}){await e.request({method:`${e.mode}_setStorageAt`,params:[t,typeof n=="number"?R(n):n,a]})}async function zt(e){return await e.request({method:"evm_snapshot"})}async function Vt(e,{address:t}){await e.request({method:`${e.mode}_stopImpersonatingAccount`,params:[t]})}function jt({mode:e}){return t=>{const n=t.extend(()=>({mode:e}));return{dropTransaction:a=>ht(n,a),dumpState:()=>ft(n),getAutomine:()=>gt(n),getTxpoolContent:()=>wt(n),getTxpoolStatus:()=>yt(n),impersonateAccount:a=>Ct(n,a),increaseTime:a=>bt(n,a),inspectTxpool:()=>vt(n),loadState:a=>Tt(n,a),mine:a=>At(n,a),removeBlockTimestampInterval:()=>xt(n),reset:a=>St(n,a),revert:a=>Rt(n,a),sendUnsignedTransaction:a=>Et(n,a),setAutomine:a=>Pt(n,a),setBalance:a=>kt(n,a),setBlockGasLimit:a=>qt(n,a),setBlockTimestampInterval:a=>_t(n,a),setCode:a=>It(n,a),setCoinbase:a=>Nt(n,a),setIntervalMining:a=>Bt(n,a),setLoggingEnabled:a=>Dt(n,a),setMinGasPrice:a=>Ot(n,a),setNextBlockBaseFeePerGas:a=>Mt(n,a),setNextBlockTimestamp:a=>Wt(n,a),setNonce:a=>Ft(n,a),setRpcUrl:a=>Lt(n,a),setStorageAt:a=>$t(n,a),snapshot:()=>zt(n),stopImpersonatingAccount:a=>Vt(n,a)}}}function Ht(e){const{key:t="test",name:n="Test Client",mode:a}=e;return De({...e,key:t,name:n,type:"testClient"}).extend(r=>({mode:a,...jt({mode:a})(r)}))}async function Ut(e,{chain:t}){const{id:n,name:a,nativeCurrency:s,rpcUrls:r,blockExplorers:i}=t;await e.request({method:"wallet_addEthereumChain",params:[{chainId:R(n),chainName:a,nativeCurrency:s,rpcUrls:r.default.http,blockExplorerUrls:i?Object.values(i).map(({url:c})=>c):void 0}]},{dedupe:!0,retryCount:0})}function Jt(e,t){const{abi:n,args:a,bytecode:s,...r}=t,i=Oe({abi:n,args:a,bytecode:s});return te(e,{...r,...r.authorizationList?{to:null}:{},data:i})}async function Gt(e){return e.account?.type==="local"?[e.account.address]:(await e.request({method:"eth_accounts"},{dedupe:!0})).map(n=>st(n))}async function Kt(e,t={}){const{account:n=e.account,chainId:a}=t,s=n?O(n):void 0,r=a?[s?.address,[R(a)]]:[s?.address],i=await e.request({method:"wallet_getCapabilities",params:r}),c={};for(const[l,o]of Object.entries(i)){c[Number(l)]={};for(let[u,h]of Object.entries(o))u==="addSubAccount"&&(u="unstable_addSubAccount"),c[Number(l)][u]=h}return typeof a=="number"?c[a]:c}async function Qt(e){return await e.request({method:"wallet_getPermissions"},{dedupe:!0})}async function Yt(e){return(await e.request({method:"eth_requestAccounts"},{dedupe:!0,retryCount:0})).map(n=>rt(n))}async function Xt(e,t){return e.request({method:"wallet_requestPermissions",params:[t]},{retryCount:0})}async function Zt(e,t){const{chain:n=e.chain}=t,a=t.timeout??Math.max((n?.blockTime??0)*3,5e3),s=await Te(e,t);return await Ae(e,{...t,id:s.id,timeout:a})}const G=new it(128);async function Re(e,t){const{account:n=e.account,chain:a=e.chain,accessList:s,authorizationList:r,blobs:i,data:c,gas:l,gasPrice:o,maxFeePerBlobGas:u,maxFeePerGas:h,maxPriorityFeePerGas:f,nonce:d,pollingInterval:p,throwOnReceiptRevert:g,type:y,value:C,...A}=t,v=t.timeout??Math.max((a?.blockTime??0)*3,5e3);if(typeof n>"u")throw new F({docsPath:"/docs/actions/wallet/sendTransactionSync"});const b=n?O(n):null;try{ye(t);const k=await(async()=>{if(t.to)return t.to;if(t.to!==null&&r&&r.length>0)return await Me({authorization:r[0]}).catch(()=>{throw new Ce("`to` is required. Could not infer from `authorizationList`.")})})();if(b?.type==="json-rpc"||b===null){let T;a!==null&&(T=await D(e,Y,"getChainId")({}),xe({currentChainId:T,chain:a}));const x=e.chain?.formatters?.transactionRequest?.format,S=(x||Z)({...we(A,{format:x}),accessList:s,account:b,authorizationList:r,blobs:i,chainId:T,data:c,gas:l,gasPrice:o,maxFeePerBlobGas:u,maxFeePerGas:h,maxPriorityFeePerGas:f,nonce:d,to:k,type:y,value:C},"sendTransaction"),P=G.get(e.uid),q=P?"wallet_sendTransaction":"eth_sendTransaction",E=await(async()=>{try{return await e.request({method:q,params:[S]},{retryCount:0})}catch(ne){if(P===!1)throw ne;const B=ne;if(B.name==="InvalidInputRpcError"||B.name==="InvalidParamsRpcError"||B.name==="MethodNotFoundRpcError"||B.name==="MethodNotSupportedRpcError")return await e.request({method:"wallet_sendTransaction",params:[S]},{retryCount:0}).then(H=>(G.set(e.uid,!0),H)).catch(H=>{const U=H;throw U.name==="MethodNotFoundRpcError"||U.name==="MethodNotSupportedRpcError"?(G.set(e.uid,!1),B):U});throw B}})(),j=await D(e,We,"waitForTransactionReceipt")({checkReplacement:!1,hash:E,pollingInterval:p,timeout:v});if(g&&j.status==="reverted")throw new ot({receipt:j});return j}if(b?.type==="local"){const T=await D(e,me,"prepareTransactionRequest")({account:b,accessList:s,authorizationList:r,blobs:i,chain:a,data:c,gas:l,gasPrice:o,maxFeePerBlobGas:u,maxFeePerGas:h,maxPriorityFeePerGas:f,nonce:d,nonceManager:b.nonceManager,parameters:[...Fe,"sidecars"],type:y,value:C,...A,to:k}),x=a?.serializers?.transaction,w=await b.signTransaction(T,{serializer:x});return await D(e,pe,"sendRawTransactionSync")({serializedTransaction:w,throwOnReceiptRevert:g})}throw b?.type==="smart"?new L({metaMessages:["Consider using the `sendUserOperation` Action instead."],docsPath:"/docs/actions/bundler/sendUserOperation",type:"smart"}):new L({docsPath:"/docs/actions/wallet/sendTransactionSync",type:b?.type})}catch(k){throw k instanceof L?k:Le(k,{...t,account:b,chain:t.chain||void 0})}}async function en(e,t){const{id:n}=t;await e.request({method:"wallet_showCallsStatus",params:[n]})}async function tn(e,t){const{account:n=e.account}=t;if(!n)throw new F({docsPath:"/docs/eip7702/signAuthorization"});const a=O(n);if(!a.signAuthorization)throw new L({docsPath:"/docs/eip7702/signAuthorization",metaMessages:["The `signAuthorization` Action does not support JSON-RPC Accounts."],type:a.type});const s=await Se(e,t);return a.signAuthorization(s)}async function nn(e,t){const{account:n=e.account,chain:a=e.chain,...s}=t;if(!n)throw new F({docsPath:"/docs/actions/wallet/signTransaction"});const r=O(n);ye({account:r,...t});const i=await D(e,Y,"getChainId")({});a!==null&&xe({currentChainId:i,chain:a});const l=(a?.formatters||e.chain?.formatters)?.transactionRequest?.format||Z;return r.signTransaction?r.signTransaction({...s,chainId:i},{serializer:e.chain?.serializers?.transaction}):await e.request({method:"eth_signTransaction",params:[{...l({...s,account:r},"signTransaction"),chainId:R(i),from:r.address}]},{retryCount:0})}async function an(e,t){const{account:n=e.account,domain:a,message:s,primaryType:r}=t;if(!n)throw new F({docsPath:"/docs/actions/wallet/signTypedData"});const i=O(n),c={EIP712Domain:$e({domain:a}),...t.types};if(ze({domain:a,message:s,primaryType:r,types:c}),i.signTypedData)return i.signTypedData({domain:a,message:s,primaryType:r,types:c});const l=Ve({domain:a,message:s,primaryType:r,types:c});return e.request({method:"eth_signTypedData_v4",params:[i.address,l]},{retryCount:0})}async function sn(e,{id:t}){await e.request({method:"wallet_switchEthereumChain",params:[{chainId:R(t)}]},{retryCount:0})}async function rn(e,t){return await e.request({method:"wallet_watchAsset",params:t},{retryCount:0})}async function on(e,t){return W.internal(e,Re,"sendTransactionSync",t)}function Ee(e){return{addChain:t=>Ut(e,t),deployContract:t=>Jt(e,t),fillTransaction:t=>Ue(e,t),getAddresses:()=>Gt(e),getCallsStatus:t=>dt(e,t),getCapabilities:t=>Kt(e,t),getChainId:()=>Y(e),getPermissions:()=>Qt(e),prepareAuthorization:t=>Se(e,t),prepareTransactionRequest:t=>me(e,t),requestAddresses:()=>Yt(e),requestPermissions:t=>Xt(e,t),sendCalls:t=>Te(e,t),sendCallsSync:t=>Zt(e,t),sendRawTransaction:t=>He(e,t),sendRawTransactionSync:t=>pe(e,t),sendTransaction:t=>te(e,t),sendTransactionSync:t=>Re(e,t),showCallsStatus:t=>en(e,t),signAuthorization:t=>tn(e,t),signMessage:t=>je(e,t),signTransaction:t=>nn(e,t),signTypedData:t=>an(e,t),switchChain:t=>sn(e,t),waitForCallsStatus:t=>Ae(e,t),watchAsset:t=>rn(e,t),writeContract:t=>W(e,t),writeContractSync:t=>on(e,t)}}function cn(e,t={}){const{keepAlive:n,key:a="webSocket",methods:s,name:r="WebSocket JSON-RPC",reconnect:i,retryDelay:c}=t;return({chain:l,retryCount:o,timeout:u})=>{const h=t.retryCount??o,f=u??t.timeout??1e4,d=e,p={keepAlive:n,reconnect:i};return Je({key:a,methods:s,name:r,async request({method:g,params:y}){const C={method:g,params:y},A=await $(d,p),{error:v,result:b}=await A.requestAsync({body:C,timeout:f});if(v)throw new Ge({body:C,error:v,url:d});return b},retryCount:h,retryDelay:c,timeout:f,type:"webSocket"},{getSocket(){return pt(d)},getRpcClient(){return $(d,p)},async subscribe({params:g,onData:y,onError:C}){const A=await $(d,p),{result:v}=await new Promise((b,k)=>A.request({body:{method:"eth_subscribe",params:g},onError(T){k(T),C?.(T)},onResponse(T){if(T.error){k(T.error),C?.(T.error);return}if(typeof T.id=="number"){b(T);return}T.method==="eth_subscription"&&y(T.params)}}));return{subscriptionId:v,async unsubscribe(){return new Promise(b=>A.request({body:{method:"eth_unsubscribe",params:[v]},onResponse:b}))}}}})}}var oe={};const m={MAINNET:1,OPTIMISM:10,GNOSIS:100,UNICHAIN:130,POLYGON:137,ARBITRUM:42161,BASE:8453,LINEA:59144,PLASMA:9745,AVALANCHE:43114,BNB:56,HARDHAT:31337},sa={V2:"0xBA12222222228d8Ba445958a75a0704d566BF2C8",V3:"0xbA1333333333a1BA1108E8412f11850A5C319bA9"},ra={[m.MAINNET]:"0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb",[m.OPTIMISM]:"0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb",[m.BASE]:"0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb",[m.ARBITRUM]:"0x6c247b1F6182318877311737BaC0844bAa518F5e"},ia={[m.MAINNET]:"0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2",[m.OPTIMISM]:"0x794a61358D6845594F94dc1DB02A252b5b4814aD",[m.POLYGON]:"0x794a61358D6845594F94dc1DB02A252b5b4814aD",[m.ARBITRUM]:"0x794a61358D6845594F94dc1DB02A252b5b4814aD",[m.AVALANCHE]:"0x794a61358D6845594F94dc1DB02A252b5b4814aD",[m.BASE]:"0xA238Dd80C259a72e81d7e4664a9801593F98d1c5",[m.LINEA]:"0x3E5f750726cc1D0d4a9c62c507f890f984576507"},oa={AAVE_BORROWER:"0x7d9C4DeE56933151Bc5C909cfe09DEf0d315CB4A",ERC3156_BORROWER:"0x47d71b4B3336AB2729436186C216955F3C27cD04"},ca={[m.MAINNET]:"https://api.cow.fi/mainnet",[m.ARBITRUM]:"https://api.cow.fi/arbitrum_one",[m.BASE]:"https://api.cow.fi/base",[m.OPTIMISM]:"https://api.cow.fi/optimism",[m.GNOSIS]:"https://api.cow.fi/xdai",[m.POLYGON]:"https://api.cow.fi/polygon",[m.AVALANCHE]:"https://api.cow.fi/avalanche",[m.BNB]:"https://api.cow.fi/bnb",[m.LINEA]:"https://api.cow.fi/linea"},ua={[m.MAINNET]:"https://explorer.cow.fi",[m.ARBITRUM]:"https://explorer.cow.fi/arb1",[m.BASE]:"https://explorer.cow.fi/base",[m.OPTIMISM]:"https://explorer.cow.fi/op",[m.GNOSIS]:"https://explorer.cow.fi/gc",[m.POLYGON]:"https://explorer.cow.fi/polygon",[m.AVALANCHE]:"https://explorer.cow.fi/avalanche",[m.BNB]:"https://explorer.cow.fi/bnb",[m.LINEA]:"https://explorer.cow.fi/linea"},la={[m.MAINNET]:"ethereum",[m.BASE]:"base",[m.ARBITRUM]:"arbitrum",[m.OPTIMISM]:"optimism",[m.POLYGON]:"polygon"},un=typeof process<"u"&&oe?.NEXT_PUBLIC_FORK_CHAIN_ID?parseInt(oe.NEXT_PUBLIC_FORK_CHAIN_ID,10):m.ARBITRUM;function ln(e){return e===m.HARDHAT?un:e}function dn(e,t={}){const{chainId:n,...a}=t,s=e.getClient({chainId:n});return he(s,Ke,"getBlockNumber")(a)}async function mn(e,t={}){return(await Qe(e,t)).extend(Ee)}function pn(e,t){const{syncConnectedChain:n=e._internal.syncConnectedChain,...a}=t;let s;const r=l=>{s&&s();const o=e.getClient({chainId:l});return s=he(o,Ye,"watchBlockNumber")(a),s},i=r(t.chainId);let c;return n&&!t.chainId&&(c=e.subscribe(({chainId:l})=>l,async l=>r(l))),()=>{i?.(),c?.()}}function hn(e,t={}){return{gcTime:0,async queryFn({queryKey:n}){const{scopeKey:a,...s}=n[1];return await dn(e,s)??null},queryKey:fn(t)}}function fn(e={}){return["blockNumber",fe(e)]}function gn(e,t={}){return{gcTime:0,async queryFn({queryKey:n}){const{connector:a}=t,{connectorUid:s,scopeKey:r,...i}=n[1];return mn(e,{...i,connector:a})},queryKey:wn(t)}}function wn(e={}){const{connector:t,...n}=e;return["walletClient",{...fe(n),connectorUid:t?.uid}]}function yn(e={}){const{enabled:t=!0,onBlockNumber:n,config:a,...s}=e,r=ee(e),i=X({config:r}),c=e.chainId??i;I.useEffect(()=>{if(t&&n)return pn(r,{...s,chainId:c,onBlockNumber:n})},[c,r,t,n,s.onError,s.emitMissed,s.emitOnBegin,s.poll,s.pollingInterval,s.syncConnectedChain])}function Cn(e={}){const{query:t={},watch:n}=e,a=ee(e),s=be(),r=X({config:a}),i=e.chainId??r,c=hn(a,{...e,chainId:i});return yn({config:e.config,chainId:e.chainId,...typeof n=="object"?n:{},enabled:!!((t.enabled??!0)&&(typeof n=="object"?n.enabled:n)),onBlockNumber(l){s.setQueryData(c.queryKey,l)}}),ge({...t,...c})}function bn(e={}){const{query:t={},...n}=e,a=ee(n),s=be(),{address:r,connector:i,status:c}=ve({config:a}),l=X({config:a}),o=e.connector??i,{queryKey:u,...h}=gn(a,{...e,chainId:e.chainId??l,connector:e.connector??i}),f=!!((c==="connected"||c==="reconnecting"&&o?.getProvider)&&(t.enabled??!0)),d=I.useRef(r);return I.useEffect(()=>{const p=d.current;!r&&p?(s.removeQueries({queryKey:u}),d.current=void 0):r!==p&&(s.invalidateQueries({queryKey:u}),d.current=r)},[r,s]),ge({...t,...h,queryKey:u,enabled:f,staleTime:Number.POSITIVE_INFINITY})}const ce={"0x77a6a896":"Borrow cap exceeded - this asset has reached its maximum borrow limit on Aave","0xf58f733a":"Supply cap exceeded - this asset has reached its maximum supply limit on Aave","0x53587745":"Borrowing not enabled - this asset cannot be borrowed on Aave","0x6d305815":"Reserve frozen - this asset is temporarily frozen on Aave","0xd37f5f1c":"Reserve paused - this asset is temporarily paused on Aave","0x30d1eeb9":"Asset not borrowable in isolation mode","0xc27f9abe":"Siloed borrowing violation - cannot borrow multiple siloed assets","0xe24734c2":"Debt ceiling exceeded","0x366eb54d":"Health factor too low - would put position at liquidation risk","0xe3fa20f5":"Insufficient collateral to cover new borrow","0xb7f5e224":"Not enough available balance","0x6679996d":"Collateral cannot be used for borrowing - this asset has LTV=0 on Aave (e.g., PT tokens)","0x9a446475":"Swap slippage too high - try increasing slippage tolerance","0x11157667":"Insufficient output amount from swap","0xfb8f41b2":"Insufficient token allowance","0xe450d38c":"Insufficient token balance","0xfb37391e":"Invalid flash loan executor return","0x342b12c9":"Flash loan premium exceeds maximum","0x08c379a0":"Transaction reverted","0xbb55fd27":"Insufficient liquidity - you need to enter the market first or add more collateral","0x4ef4c3e1":"Mint not allowed - market may be paused or you haven't entered it","0x69609fc6":"Market not listed - this asset is not available on Venus","0x7a7fcb5a":"Enter markets failed - could not enable asset as collateral","0x00b284f2":"Withdrawal failed - check Aave pool status and your collateral balance","0xf0dbeea5":"Transaction failed - check protocol status and try again"};function vn(e){return e?typeof e=="string"?e:e instanceof Uint8Array||ArrayBuffer.isView(e)?"0x"+Array.from(e).map(t=>t.toString(16).padStart(2,"0")).join(""):typeof e=="object"&&e!==null&&"toString"in e?String(e):null:null}function Tn(e){try{const n=e.slice(74,138),a=parseInt(n,16),s=e.slice(138,138+a*2);return Buffer.from(s,"hex").toString("utf8")||"Transaction reverted"}catch{return"Transaction reverted with an error"}}const An={0:"Generic panic",1:"Assertion failed",17:"Arithmetic overflow/underflow",18:"Division by zero",33:"Invalid enum value",34:"Storage encoding error",49:"Empty array pop",50:"Array out of bounds",65:"Memory allocation error",81:"Zero function pointer call"};function xn(e){try{const t=parseInt(e.slice(10),16);return An[t]||`Panic code: ${t}`}catch{return"Transaction panicked"}}function Pe(e){const t=vn(e);if(!t||t==="0x"||t.length<10)return"Transaction reverted without a reason";const n=t.slice(0,10).toLowerCase();return ce[n]?ce[n]:n==="0x08c379a0"?Tn(t):n==="0x4e487b71"?xn(t):`Unknown error (${n})`}function K(e){if(!e)return"";if(typeof e=="string"&&e.startsWith("0x"))return e;if(typeof e=="object"&&e!==null){if("data"in e&&typeof e.data=="string")return e.data;try{const n=String(e).match(/(0x[a-fA-F0-9]{8,})/);return n?n[1]:""}catch{return""}}return""}function Sn(e){let t=K(e?.cause?.data)||K(e?.data)||"";if(!t&&e?.walk)try{const n=e.walk(a=>a?.data);t=K(n?.data)}catch{}return t}function Rn(e){const t=e.match(/return data: (0x[a-fA-F0-9]+)/i);if(t)return t[1];const n=e.match(/data:\s*(0x[a-fA-F0-9]+)/i);if(n)return n[1];const a=e.match(/(0x[a-fA-F0-9]{8,})/);return a?a[1]:""}async function da(e,t,n,a){try{return await e.call({to:t,data:n,account:a}),{success:!0}}catch(s){let r=Sn(s);return!r&&s?.message&&(r=Rn(s.message)),{success:!1,error:r?Pe(r):s?.shortMessage||s?.message||"Transaction simulation failed",rawError:r||void 0}}}function En(e){return e.includes("Borrow cap exceeded")?{title:"Borrow Cap Reached",description:"This asset has reached its maximum borrow limit on Aave.",suggestion:"Try borrowing a different asset or a smaller amount."}:e.includes("Supply cap exceeded")?{title:"Supply Cap Reached",description:"This asset has reached its maximum supply limit on Aave.",suggestion:"Try supplying a different asset or a smaller amount."}:null}function Pn(e){return e.includes("slippage")?{title:"Slippage Too High",description:"The price moved too much during the transaction.",suggestion:"Try increasing your slippage tolerance or reducing the amount."}:null}function kn(e){return e.includes("Health factor")||e.includes("liquidation")?{title:"Position At Risk",description:"This transaction would put your position at liquidation risk.",suggestion:"Try a smaller amount or add more collateral first."}:e.includes("collateral")?{title:"Insufficient Collateral",description:"You don't have enough collateral to support this borrow.",suggestion:"Add more collateral or borrow a smaller amount."}:null}function qn(e){return e.includes("Insufficient liquidity")||e.includes("enter the market")?{title:"Market Entry Required",description:"Your collateral needs to be enabled before you can borrow against it.",suggestion:"The transaction should include an 'Enter Markets' step. Try again or contact support."}:null}function _n(e){return e.includes("frozen")||e.includes("paused")?{title:"Asset Unavailable",description:"This asset is temporarily unavailable on the protocol.",suggestion:"Try again later or use a different asset."}:null}function ma(e){const t=[En,Pn,kn,qn,_n];for(const n of t){const a=n(e);if(a)return a}return{title:"Transaction Failed",description:e}}const In=new Set([4001,"ACTION_REJECTED","USER_REJECTED"]),Nn=["user rejected","user denied","user cancelled","rejected","denied","cancelled","rejection"];function Bn(e){if(!e)return!1;const t=e;if(t.code!==void 0&&In.has(t.code))return!0;const n=(t.message||t.shortMessage||t.details||"").toLowerCase();return Nn.some(a=>n.includes(a))}function Q(e){if(!e)return"";if(typeof e=="string"&&e.startsWith("0x"))return e;if(typeof e=="object"&&e!==null&&"data"in e){const a=e.data;if(typeof a=="string")return a}const n=String(e).match(/(0x[a-fA-F0-9]{8,})/);return n?n[1]:""}function Dn(e){if(!e.walk)return"";try{const t=e.walk(n=>n?.data);return Q(t?.data)}catch{return""}}function On(e){const t=[/return data: (0x[a-fA-F0-9]+)/i,/data:\s*(0x[a-fA-F0-9]+)/i,/(0x[a-fA-F0-9]{8,})/];for(const n of t){const a=e.match(n);if(a)return a[1]}return""}function Mn(e){if(!e)return"";const t=e;let n=Q(t.cause?.data)||Q(t.data);return n||(n=Dn(t)),!n&&t.message&&(n=On(t.message)),n}function Wn(e,t){if(e.details)return e.details;if(e.shortMessage){if(e instanceof ct&&e.data&&e.data.errorName!=="Error"){const s=e.data?.args?.toString()??"";return`${e.shortMessage.replace(/reverted\.$/,"reverted with the following reason:")}
${e.data?.errorName}(${s})`}return e.shortMessage}return e.message??e.name??t}function Fn(e,t={}){const{rejectionMessage:n="User rejected the request",fallbackMessage:a="An unknown error occurred",decodeDeFiErrors:s=!0}=t;if(Bn(e))return n;if(s){const c=Mn(e);if(c&&c.length>=10){const l=Pe(c);if(l&&!l.includes("Unknown error"))return l}}const r=e,i=r.walk?r.walk():e;return i instanceof Ce?Wn(i,a):r.shortMessage?r.shortMessage:r.message?r.message:a}const Ln=e=>Fn(e);function $n(){const{chain:e}=ve(),t=V(({targetEVMNetwork:a})=>a),n=V(({setTargetEVMNetwork:a})=>a);return I.useEffect(()=>{const a=ut.targetEVMNetworks.find(s=>s.id===e?.id);a&&a.id!==t.id&&n(a)},[e?.id,n,t.id]),I.useMemo(()=>({targetNetwork:{...t,...Xe[t.id]}}),[t])}Ht({chain:et,mode:"hardhat",transport:cn("ws://127.0.0.1:8545")}).extend(Ze).extend(Ee);var ue=["light","dark"],zn="(prefers-color-scheme: dark)",Vn=I.createContext(void 0),jn={setTheme:e=>{},themes:[]},pa=()=>{var e;return(e=I.useContext(Vn))!=null?e:jn};I.memo(({forcedTheme:e,storageKey:t,attribute:n,enableSystem:a,enableColorScheme:s,defaultTheme:r,value:i,attrs:c,nonce:l})=>{let o=r==="system",u=n==="class"?`var d=document.documentElement,c=d.classList;${`c.remove(${c.map(p=>`'${p}'`).join(",")})`};`:`var d=document.documentElement,n='${n}',s='setAttribute';`,h=s?ue.includes(r)&&r?`if(e==='light'||e==='dark'||!e)d.style.colorScheme=e||'${r}'`:"if(e==='light'||e==='dark')d.style.colorScheme=e":"",f=(p,g=!1,y=!0)=>{let C=i?i[p]:p,A=g?p+"|| ''":`'${C}'`,v="";return s&&y&&!g&&ue.includes(p)&&(v+=`d.style.colorScheme = '${p}';`),n==="class"?g||C?v+=`c.add(${A})`:v+="null":C&&(v+=`d[s](n,${A})`),v},d=e?`!function(){${u}${f(e)}}()`:a?`!function(){try{${u}var e=localStorage.getItem('${t}');if('system'===e||(!e&&${o})){var t='${zn}',m=window.matchMedia(t);if(m.media!==t||m.matches){${f("dark")}}else{${f("light")}}}else if(e){${i?`var x=${JSON.stringify(i)};`:""}${f(i?"x[e]":"e",!0)}}${o?"":"else{"+f(r,!1,!1)+"}"}${h}}catch(e){}}()`:`!function(){try{${u}var e=localStorage.getItem('${t}');if(e){${i?`var x=${JSON.stringify(i)};`:""}${f(i?"x[e]":"e",!0)}}else{${f(r,!1,!1)};}${h}}catch(t){}}();`;return I.createElement("script",{nonce:l,dangerouslySetInnerHTML:{__html:d}})});const Hn=()=>{const{targetNetwork:e}=$n(),t=V(a=>a.setBlockNumber),{data:n}=Cn({watch:!0,chainId:e.id});return I.useEffect(()=>{t(n)},[n,t]),null},le=({children:e})=>N.jsxs(N.Fragment,{children:[e,N.jsx(Hn,{})]}),ha=()=>V(e=>e.blockNumber);try{le.displayName="BlockNumberProvider",le.__docgenInfo={description:"",displayName:"BlockNumberProvider",props:{}}}catch{}const de=e=>{let t=e;const{data:n}=bn();return t===void 0&&n&&(t=n),async(s,r)=>{if(!t){_.error("Cannot access account"),console.error("⚡️ ~ file: useTransactor.tsx ~ error");return}let i=null,c,l,o="";try{const u=await t.getChainId(),h=tt(nt);i=_.loading(N.jsx(M,{step:"pending",message:"Waiting for approval..."}));const f=setTimeout(()=>{i&&_.remove(i)},1e4);try{if(typeof s=="function")c=await s();else if(s!=null)c=await t.sendTransaction(s);else throw new Error("Incorrect transaction passed to transactor");clearTimeout(f)}catch(g){throw clearTimeout(f),g}o=u?at(u,c):"",_.remove(i),i=_.loading(N.jsx(M,{step:"sent",txHash:c,message:"Waiting for transaction to complete.",blockExplorerLink:o}));const d=new Set([10,420,8453,84531,84532,11155420]),p=r?.blockConfirmations??(d.has(u)?2:1);if(l=await h.waitForTransactionReceipt({hash:c,confirmations:p}),_.remove(i),l.status==="reverted")throw new Error("Transaction reverted");_.success(N.jsx(M,{step:"confirmed",txHash:c,message:"Transaction completed successfully!",blockExplorerLink:o})),typeof window<"u"&&window.dispatchEvent(new Event("txCompleted")),r?.onBlockConfirmation&&r.onBlockConfirmation(l)}catch(u){i&&_.remove(i),console.error("⚡️ ~ file: useTransactor.ts ~ error",u);const h=Ln(u);throw l?.status==="reverted"?(_.error(N.jsx(M,{step:"failed",txHash:c,message:h,blockExplorerLink:o})),u):(_.error(N.jsx(M,{step:"failed",txHash:c,message:h,blockExplorerLink:o})),u)}return c}};try{de.displayName="useTransactor",de.__docgenInfo={description:"Runs Transaction passed in to returned function showing UI feedback.",displayName:"useTransactor",props:{account:{defaultValue:null,description:"The Account of the Client.",name:"account",required:!0,type:{name:"Account | undefined"}},batch:{defaultValue:null,description:"Flags for batch settings.",name:"batch",required:!1,type:{name:"{ multicall?: boolean | { batchSize?: number; deployless?: boolean; wait?: number | undefined; } | undefined; } | undefined"}},cacheTime:{defaultValue:null,description:"Time (in ms) that cached data will remain in memory.",name:"cacheTime",required:!0,type:{name:"number"}},ccipRead:{defaultValue:null,description:"[CCIP Read](https://eips.ethereum.org/EIPS/eip-3668) configuration.",name:"ccipRead",required:!1,type:{name:"false | { request?: ((parameters: CcipRequestParameters) => Promise<`0x${string}`>); }"}},chain:{defaultValue:null,description:"Chain for the client.",name:"chain",required:!0,type:{name:"Chain | undefined"}},experimental_blockTag:{defaultValue:null,description:"Default block tag to use for RPC requests.",name:"experimental_blockTag",required:!1,type:{name:"enum",value:[{value:'"latest"'},{value:'"earliest"'},{value:'"pending"'},{value:'"safe"'},{value:'"finalized"'}]}},key:{defaultValue:null,description:"A key for the client.",name:"key",required:!0,type:{name:"string"}},name:{defaultValue:null,description:"A name for the client.",name:"name",required:!0,type:{name:"string"}},pollingInterval:{defaultValue:null,description:"Frequency (in ms) for polling enabled actions & events. Defaults to 4_000 milliseconds.",name:"pollingInterval",required:!0,type:{name:"number"}},request:{defaultValue:null,description:"Request function wrapped with friendly error handling",name:"request",required:!0,type:{name:"EIP1193RequestFn<WalletRpcSchema>"}},transport:{defaultValue:null,description:"The RPC transport",name:"transport",required:!0,type:{name:"TransportConfig<string, EIP1193RequestFn> & Record<string, any>"}},type:{defaultValue:null,description:"The type of client.",name:"type",required:!0,type:{name:"string"}},uid:{defaultValue:null,description:"A unique ID for the client.",name:"uid",required:!0,type:{name:"string"}},addChain:{defaultValue:null,description:`Adds an EVM chain to the wallet.

- Docs: https://viem.sh/docs/actions/wallet/addChain
- JSON-RPC Methods: [\`eth_addEthereumChain\`](https://eips.ethereum.org/EIPS/eip-3085)
@param args - {@link AddChainParameters }
@example import { createWalletClient, custom } from 'viem'
import { optimism } from 'viem/chains'

const client = createWalletClient({
  transport: custom(window.ethereum),
})
await client.addChain({ chain: optimism })`,name:"addChain",required:!0,type:{name:"(args: AddChainParameters) => Promise<void>"}},deployContract:{defaultValue:null,description:`Deploys a contract to the network, given bytecode and constructor arguments.

- Docs: https://viem.sh/docs/contract/deployContract
- Examples: https://stackblitz.com/github/wevm/viem/tree/main/examples/contracts_deploying-contracts
@param args - {@link DeployContractParameters }
@returns The [Transaction](https://viem.sh/docs/glossary/terms#transaction) hash. {@link DeployContractReturnType }
@example import { createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { mainnet } from 'viem/chains'

const client = createWalletClient({
  account: privateKeyToAccount('0x…'),
  chain: mainnet,
  transport: http(),
})
const hash = await client.deployContract({
  abi: [],
  account: '0x…,
  bytecode: '0x608060405260405161083e38038061083e833981016040819052610...',
})`,name:"deployContract",required:!0,type:{name:"<const abi extends Abi | readonly unknown[], chainOverride extends Chain | undefined>(args: DeployContractParameters<abi, Chain | undefined, Account | undefined, chainOverride>) => Promise<...>"}},fillTransaction:{defaultValue:null,description:`Fills a transaction request with the necessary fields to be signed over.

- Docs: https://viem.sh/docs/actions/public/fillTransaction
@param client - Client to use
@param parameters - {@link FillTransactionParameters }
@returns The filled transaction. {@link FillTransactionReturnType }
@example import { createWalletClient, custom } from 'viem'
import { mainnet } from 'viem/chains'

const client = createWalletClient({
  chain: mainnet,
  transport: custom(window.ethereum),
})
const result = await client.fillTransaction({
  account: '0xA0Cf798816D4b9b9866b5330EEa46a18382f251e',
  to: '0x70997970c51812dc3a010c7d01b50e0d17dc79c8',
  value: parseEther('1'),
})`,name:"fillTransaction",required:!0,type:{name:"<chainOverride extends Chain | undefined = undefined, accountOverride extends Account | Address | undefined = undefined>(args: FillTransactionParameters<Chain | undefined, Account | undefined, chainOverride, accountOverride>) => Promise<...>"}},getAddresses:{defaultValue:null,description:`Returns a list of account addresses owned by the wallet or client.

- Docs: https://viem.sh/docs/actions/wallet/getAddresses
- JSON-RPC Methods: [\`eth_accounts\`](https://ethereum.org/en/developers/docs/apis/json-rpc/#eth_accounts)
@returns List of account addresses owned by the wallet or client. {@link GetAddressesReturnType }
@example import { createWalletClient, custom } from 'viem'
import { mainnet } from 'viem/chains'

const client = createWalletClient({
  chain: mainnet,
  transport: custom(window.ethereum),
})
const accounts = await client.getAddresses()`,name:"getAddresses",required:!0,type:{name:"() => Promise<GetAddressesReturnType>"}},getCallsStatus:{defaultValue:null,description:`Returns the status of a call batch that was sent via \`sendCalls\`.

- Docs: https://viem.sh/docs/actions/wallet/getCallsStatus
- JSON-RPC Methods: [\`wallet_getCallsStatus\`](https://eips.ethereum.org/EIPS/eip-5792)
@param client - Client to use
@returns Status of the calls. {@link GetCallsStatusReturnType }
@example import { createWalletClient, custom } from 'viem'
import { mainnet } from 'viem/chains'

const client = createWalletClient({
  chain: mainnet,
  transport: custom(window.ethereum),
})

const { receipts, status } = await client.getCallsStatus({ id: '0xdeadbeef' })`,name:"getCallsStatus",required:!0,type:{name:'(parameters: GetCallsStatusParameters) => Promise<{ chainId: number; id: string; atomic: boolean; capabilities?: { [key: string]: any; } | { [x: string]: any; } | undefined; receipts?: WalletCallReceipt<...>[] | undefined; version: string; statusCode: number; status: "success" | ... 2 more ... | undefined; }>'}},getCapabilities:{defaultValue:null,description:`Extract capabilities that a connected wallet supports (e.g. paymasters, session keys, etc).

- Docs: https://viem.sh/docs/actions/wallet/getCapabilities
- JSON-RPC Methods: [\`wallet_getCapabilities\`](https://eips.ethereum.org/EIPS/eip-5792)
@param client - Client to use
@returns The wallet's capabilities. {@link GetCapabilitiesReturnType }
@example import { createWalletClient, custom } from 'viem'
import { mainnet } from 'viem/chains'

const client = createWalletClient({
  chain: mainnet,
  transport: custom(window.ethereum),
})

const capabilities = await client.getCapabilities({
  account: '0xA0Cf798816D4b9b9866b5330EEa46a18382f251e',
})`,name:"getCapabilities",required:!0,type:{name:"<chainId extends number | undefined>(parameters?: GetCapabilitiesParameters<chainId> | undefined) => Promise<{ [K in keyof (chainId extends number ? { [x: string]: any; atomic?: { ...; } | undefined; unstable_addSubAccount?: { ...; } | undefined; paymasterService?: { ...; } | undefined; } : ChainIdToCapabilities<......"}},getChainId:{defaultValue:null,description:`Returns the chain ID associated with the current network.

- Docs: https://viem.sh/docs/actions/public/getChainId
- JSON-RPC Methods: [\`eth_chainId\`](https://ethereum.org/en/developers/docs/apis/json-rpc/#eth_chainid)
@returns The current chain ID. {@link GetChainIdReturnType }
@example import { createWalletClient, http } from 'viem'
import { mainnet } from 'viem/chains'

const client = createWalletClient({
  chain: mainnet,
  transport: custom(window.ethereum),
})
const chainId = await client.getChainId()
// 1`,name:"getChainId",required:!0,type:{name:"() => Promise<number>"}},getPermissions:{defaultValue:null,description:`Gets the wallets current permissions.

- Docs: https://viem.sh/docs/actions/wallet/getPermissions
- JSON-RPC Methods: [\`wallet_getPermissions\`](https://eips.ethereum.org/EIPS/eip-2255)
@returns The wallet permissions. {@link GetPermissionsReturnType }
@example import { createWalletClient, custom } from 'viem'
import { mainnet } from 'viem/chains'

const client = createWalletClient({
  chain: mainnet,
  transport: custom(window.ethereum),
})
const permissions = await client.getPermissions()`,name:"getPermissions",required:!0,type:{name:"() => Promise<GetPermissionsReturnType>"}},prepareAuthorization:{defaultValue:null,description:`Prepares an [EIP-7702 Authorization](https://eips.ethereum.org/EIPS/eip-7702) object for signing.
This Action will fill the required fields of the Authorization object if they are not provided (e.g. \`nonce\` and \`chainId\`).

With the prepared Authorization object, you can use [\`signAuthorization\`](https://viem.sh/docs/eip7702/signAuthorization) to sign over the Authorization object.
@param client - Client to use
@param parameters - {@link PrepareAuthorizationParameters }
@returns The prepared Authorization object. {@link PrepareAuthorizationReturnType }
@example import { createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { mainnet } from 'viem/chains'

const client = createWalletClient({
  chain: mainnet,
  transport: http(),
})

const authorization = await client.prepareAuthorization({
  account: privateKeyToAccount('0x..'),
  contractAddress: '0xA0Cf798816D4b9b9866b5330EEa46a18382f251e',
})
@example // Account Hoisting
import { createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { mainnet } from 'viem/chains'

const client = createWalletClient({
  account: privateKeyToAccount('0x…'),
  chain: mainnet,
  transport: http(),
})

const authorization = await client.prepareAuthorization({
  contractAddress: '0xA0Cf798816D4b9b9866b5330EEa46a18382f251e',
})`,name:"prepareAuthorization",required:!0,type:{name:"(parameters: PrepareAuthorizationParameters<Account | undefined>) => Promise<PrepareAuthorizationReturnType>"}},prepareTransactionRequest:{defaultValue:null,description:`Prepares a transaction request for signing.

- Docs: https://viem.sh/docs/actions/wallet/prepareTransactionRequest
@param args - {@link PrepareTransactionRequestParameters }
@returns The transaction request. {@link PrepareTransactionRequestReturnType }
@example import { createWalletClient, custom } from 'viem'
import { mainnet } from 'viem/chains'

const client = createWalletClient({
  chain: mainnet,
  transport: custom(window.ethereum),
})
const request = await client.prepareTransactionRequest({
  account: '0xA0Cf798816D4b9b9866b5330EEa46a18382f251e',
  to: '0x0000000000000000000000000000000000000000',
  value: 1n,
})
@example // Account Hoisting
import { createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { mainnet } from 'viem/chains'

const client = createWalletClient({
  account: privateKeyToAccount('0x…'),
  chain: mainnet,
  transport: custom(window.ethereum),
})
const request = await client.prepareTransactionRequest({
  to: '0x0000000000000000000000000000000000000000',
  value: 1n,
})`,name:"prepareTransactionRequest",required:!0,type:{name:"<const request extends PrepareTransactionRequestRequest<Chain | undefined, chainOverride>, chainOverride extends Chain | undefined = undefined, accountOverride extends Account | Address | undefined = undefined>(args: PrepareTransactionRequestParameters<...>) => Promise<...>"}},requestAddresses:{defaultValue:null,description:`Requests a list of accounts managed by a wallet.

- Docs: https://viem.sh/docs/actions/wallet/requestAddresses
- JSON-RPC Methods: [\`eth_requestAccounts\`](https://eips.ethereum.org/EIPS/eip-1102)

Sends a request to the wallet, asking for permission to access the user's accounts. After the user accepts the request, it will return a list of accounts (addresses).

This API can be useful for dapps that need to access the user's accounts in order to execute transactions or interact with smart contracts.
@returns List of accounts managed by a wallet {@link RequestAddressesReturnType }
@example import { createWalletClient, custom } from 'viem'
import { mainnet } from 'viem/chains'

const client = createWalletClient({
  chain: mainnet,
  transport: custom(window.ethereum),
})
const accounts = await client.requestAddresses()`,name:"requestAddresses",required:!0,type:{name:"() => Promise<RequestAddressesReturnType>"}},requestPermissions:{defaultValue:null,description:`Requests permissions for a wallet.

- Docs: https://viem.sh/docs/actions/wallet/requestPermissions
- JSON-RPC Methods: [\`wallet_requestPermissions\`](https://eips.ethereum.org/EIPS/eip-2255)
@param args - {@link RequestPermissionsParameters }
@returns The wallet permissions. {@link RequestPermissionsReturnType }
@example import { createWalletClient, custom } from 'viem'
import { mainnet } from 'viem/chains'

const client = createWalletClient({
  chain: mainnet,
  transport: custom(window.ethereum),
})
const permissions = await client.requestPermissions({
  eth_accounts: {}
})`,name:"requestPermissions",required:!0,type:{name:"(args: { [x: string]: Record<string, any>; eth_accounts: Record<string, any>; }) => Promise<RequestPermissionsReturnType>"}},sendCalls:{defaultValue:null,description:`Requests the connected wallet to send a batch of calls.

- Docs: https://viem.sh/docs/actions/wallet/sendCalls
- JSON-RPC Methods: [\`wallet_sendCalls\`](https://eips.ethereum.org/EIPS/eip-5792)
@param client - Client to use
@returns Transaction identifier. {@link SendCallsReturnType }
@example import { createWalletClient, custom } from 'viem'
import { mainnet } from 'viem/chains'

const client = createWalletClient({
  chain: mainnet,
  transport: custom(window.ethereum),
})

const id = await client.sendCalls({
  account: '0xA0Cf798816D4b9b9866b5330EEa46a18382f251e',
  calls: [
    {
      data: '0xdeadbeef',
      to: '0x70997970c51812dc3a010c7d01b50e0d17dc79c8',
    },
    {
      to: '0x70997970c51812dc3a010c7d01b50e0d17dc79c8',
      value: 69420n,
    },
  ],
})`,name:"sendCalls",required:!0,type:{name:"<const calls extends readonly unknown[], chainOverride extends Chain | undefined = undefined>(parameters: SendCallsParameters<Chain | undefined, Account | undefined, chainOverride, calls>) => Promise<...>"}},sendCallsSync:{defaultValue:null,description:`Requests the connected wallet to send a batch of calls, and waits for the calls to be included in a block.

- Docs: https://viem.sh/docs/actions/wallet/sendCallsSync
- JSON-RPC Methods: [\`wallet_sendCalls\`](https://eips.ethereum.org/EIPS/eip-5792)
@param client - Client to use
@returns Calls status. {@link SendCallsSyncReturnType }
@example import { createWalletClient, custom } from 'viem'
import { mainnet } from 'viem/chains'

const client = createWalletClient({
  chain: mainnet,
  transport: custom(window.ethereum),
})

const status = await client.sendCallsSync({
  account: '0xA0Cf798816D4b9b9866b5330EEa46a18382f251e',
  calls: [
    {
      data: '0xdeadbeef',
      to: '0x70997970c51812dc3a010c7d01b50e0d17dc79c8',
    },
    {
      to: '0x70997970c51812dc3a010c7d01b50e0d17dc79c8',
      value: 69420n,
    },
  ],
})`,name:"sendCallsSync",required:!0,type:{name:"<const calls extends readonly unknown[], chainOverride extends Chain | undefined = undefined>(parameters: SendCallsSyncParameters<Chain | undefined, Account | undefined, chainOverride, calls>) => Promise<...>"}},sendRawTransaction:{defaultValue:null,description:`Sends a **signed** transaction to the network

- Docs: https://viem.sh/docs/actions/wallet/sendRawTransaction
- JSON-RPC Method: [\`eth_sendRawTransaction\`](https://ethereum.github.io/execution-apis/api-documentation/)
@param client - Client to use
@param parameters - {@link SendRawTransactionParameters }
@returns The transaction hash. {@link SendRawTransactionReturnType }
@example import { createWalletClient, custom } from 'viem'
import { mainnet } from 'viem/chains'
import { sendRawTransaction } from 'viem/wallet'

const client = createWalletClient({
  chain: mainnet,
  transport: custom(window.ethereum),
})

const hash = await client.sendRawTransaction({
  serializedTransaction: '0x02f850018203118080825208808080c080a04012522854168b27e5dc3d5839bab5e6b39e1a0ffd343901ce1622e3d64b48f1a04e00902ae0502c4728cbf12156290df99c3ed7de85b1dbfe20b5c36931733a33'
})`,name:"sendRawTransaction",required:!0,type:{name:"(args: SendRawTransactionParameters) => Promise<`0x${string}`>"}},sendRawTransactionSync:{defaultValue:null,description:`Sends a **signed** transaction to the network synchronously,
and waits for the transaction to be included in a block.

- Docs: https://viem.sh/docs/actions/wallet/sendRawTransactionSync
- JSON-RPC Method: [\`eth_sendRawTransactionSync\`](https://eips.ethereum.org/EIPS/eip-7966)
@param client - Client to use
@param parameters - {@link SendRawTransactionSyncParameters }
@returns The transaction receipt. {@link SendRawTransactionSyncReturnType }
@example import { createWalletClient, custom } from 'viem'
import { mainnet } from 'viem/chains'
import { sendRawTransactionSync } from 'viem/wallet'

const client = createWalletClient({
  chain: mainnet,
  transport: custom(window.ethereum),
})

const receipt = await client.sendRawTransactionSync({
  serializedTransaction: '0x02f850018203118080825208808080c080a04012522854168b27e5dc3d5839bab5e6b39e1a0ffd343901ce1622e3d64b48f1a04e00902ae0502c4728cbf12156290df99c3ed7de85b1dbfe20b5c36931733a33'
})`,name:"sendRawTransactionSync",required:!0,type:{name:"(args: SendRawTransactionSyncParameters) => Promise<TransactionReceipt>"}},sendTransaction:{defaultValue:null,description:`Creates, signs, and sends a new transaction to the network.

- Docs: https://viem.sh/docs/actions/wallet/sendTransaction
- Examples: https://stackblitz.com/github/wevm/viem/tree/main/examples/transactions_sending-transactions
- JSON-RPC Methods:
  - JSON-RPC Accounts: [\`eth_sendTransaction\`](https://ethereum.org/en/developers/docs/apis/json-rpc/#eth_sendtransaction)
  - Local Accounts: [\`eth_sendRawTransaction\`](https://ethereum.org/en/developers/docs/apis/json-rpc/#eth_sendrawtransaction)
@param args - {@link SendTransactionParameters }
@returns The [Transaction](https://viem.sh/docs/glossary/terms#transaction) hash. {@link SendTransactionReturnType }
@example import { createWalletClient, custom } from 'viem'
import { mainnet } from 'viem/chains'

const client = createWalletClient({
  chain: mainnet,
  transport: custom(window.ethereum),
})
const hash = await client.sendTransaction({
  account: '0xA0Cf798816D4b9b9866b5330EEa46a18382f251e',
  to: '0x70997970c51812dc3a010c7d01b50e0d17dc79c8',
  value: 1000000000000000000n,
})
@example // Account Hoisting
import { createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { mainnet } from 'viem/chains'

const client = createWalletClient({
  account: privateKeyToAccount('0x…'),
  chain: mainnet,
  transport: http(),
})
const hash = await client.sendTransaction({
  to: '0x70997970c51812dc3a010c7d01b50e0d17dc79c8',
  value: 1000000000000000000n,
})`,name:"sendTransaction",required:!0,type:{name:"<const request extends SendTransactionRequest<Chain | undefined, chainOverride>, chainOverride extends Chain | undefined = undefined>(args: SendTransactionParameters<Chain | undefined, Account | undefined, chainOverride, request>) => Promise<...>"}},sendTransactionSync:{defaultValue:null,description:`Creates, signs, and sends a new transaction to the network synchronously.
Returns the transaction receipt.

- Docs: https://viem.sh/docs/actions/wallet/sendTransactionSync
- Examples: https://stackblitz.com/github/wevm/viem/tree/main/examples/transactions_sending-transactions
- JSON-RPC Methods:
  - JSON-RPC Accounts: [\`eth_sendTransaction\`](https://ethereum.org/en/developers/docs/apis/json-rpc/#eth_sendtransaction)
  - Local Accounts: [\`eth_sendRawTransaction\`](https://ethereum.org/en/developers/docs/apis/json-rpc/#eth_sendrawtransaction)
@param args - {@link SendTransactionParameters }
@returns The transaction receipt. {@link SendTransactionReturnType }
@example import { createWalletClient, custom } from 'viem'
import { mainnet } from 'viem/chains'

const client = createWalletClient({
  chain: mainnet,
  transport: custom(window.ethereum),
})
const receipt = await client.sendTransactionSync({
  account: '0xA0Cf798816D4b9b9866b5330EEa46a18382f251e',
  to: '0x70997970c51812dc3a010c7d01b50e0d17dc79c8',
  value: 1000000000000000000n,
})
@example // Account Hoisting
import { createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { mainnet } from 'viem/chains'

const client = createWalletClient({
  account: privateKeyToAccount('0x…'),
  chain: mainnet,
  transport: http(),
})
const receipt = await client.sendTransactionSync({
  to: '0x70997970c51812dc3a010c7d01b50e0d17dc79c8',
  value: 1000000000000000000n,
})`,name:"sendTransactionSync",required:!0,type:{name:"<const request extends SendTransactionSyncRequest<Chain | undefined, chainOverride>, chainOverride extends Chain | undefined = undefined>(args: SendTransactionSyncParameters<Chain | undefined, Account | undefined, chainOverride, request>) => Promise<...>"}},showCallsStatus:{defaultValue:null,description:`Requests for the wallet to show information about a call batch
that was sent via \`sendCalls\`.

- Docs: https://viem.sh/docs/actions/wallet/showCallsStatus
- JSON-RPC Methods: [\`wallet_showCallsStatus\`](https://eips.ethereum.org/EIPS/eip-5792)
@param client - Client to use
@returns Displays status of the calls in wallet. {@link ShowCallsStatusReturnType }
@example import { createWalletClient, custom } from 'viem'
import { mainnet } from 'viem/chains'

const client = createWalletClient({
  chain: mainnet,
  transport: custom(window.ethereum),
})

await client.showCallsStatus({ id: '0xdeadbeef' })`,name:"showCallsStatus",required:!0,type:{name:"(parameters: ShowCallsStatusParameters) => Promise<void>"}},signAuthorization:{defaultValue:null,description:`Signs an [EIP-7702 Authorization](https://eips.ethereum.org/EIPS/eip-7702) object.

With the calculated signature, you can:
- use [\`verifyAuthorization\`](https://viem.sh/docs/eip7702/verifyAuthorization) to verify the signed Authorization object,
- use [\`recoverAuthorizationAddress\`](https://viem.sh/docs/eip7702/recoverAuthorizationAddress) to recover the signing address from the signed Authorization object.
@param client - Client to use
@param parameters - {@link SignAuthorizationParameters }
@returns The signed Authorization object. {@link SignAuthorizationReturnType }
@example import { createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { mainnet } from 'viem/chains'

const client = createWalletClient({
  chain: mainnet,
  transport: http(),
})

const signature = await client.signAuthorization({
  account: privateKeyToAccount('0x..'),
  contractAddress: '0xA0Cf798816D4b9b9866b5330EEa46a18382f251e',
})
@example // Account Hoisting
import { createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { mainnet } from 'viem/chains'

const client = createWalletClient({
  account: privateKeyToAccount('0x…'),
  chain: mainnet,
  transport: http(),
})

const signature = await client.signAuthorization({
  contractAddress: '0xA0Cf798816D4b9b9866b5330EEa46a18382f251e',
})`,name:"signAuthorization",required:!0,type:{name:"(parameters: SignAuthorizationParameters<Account | undefined>) => Promise<SignAuthorizationReturnType>"}},signMessage:{defaultValue:null,description:`Calculates an Ethereum-specific signature in [EIP-191 format](https://eips.ethereum.org/EIPS/eip-191): \`keccak256("\\x19Ethereum Signed Message:\\n" + len(message) + message))\`.

- Docs: https://viem.sh/docs/actions/wallet/signMessage
- JSON-RPC Methods:
  - JSON-RPC Accounts: [\`personal_sign\`](https://docs.metamask.io/guide/signing-data#personal-sign)
  - Local Accounts: Signs locally. No JSON-RPC request.

With the calculated signature, you can:
- use [\`verifyMessage\`](https://viem.sh/docs/utilities/verifyMessage) to verify the signature,
- use [\`recoverMessageAddress\`](https://viem.sh/docs/utilities/recoverMessageAddress) to recover the signing address from a signature.
@param args - {@link SignMessageParameters }
@returns The signed message. {@link SignMessageReturnType }
@example import { createWalletClient, custom } from 'viem'
import { mainnet } from 'viem/chains'

const client = createWalletClient({
  chain: mainnet,
  transport: custom(window.ethereum),
})
const signature = await client.signMessage({
  account: '0xA0Cf798816D4b9b9866b5330EEa46a18382f251e',
  message: 'hello world',
})
@example // Account Hoisting
import { createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { mainnet } from 'viem/chains'

const client = createWalletClient({
  account: privateKeyToAccount('0x…'),
  chain: mainnet,
  transport: http(),
})
const signature = await client.signMessage({
  message: 'hello world',
})`,name:"signMessage",required:!0,type:{name:"(args: SignMessageParameters<Account | undefined>) => Promise<`0x${string}`>"}},signTransaction:{defaultValue:null,description:`Signs a transaction.

- Docs: https://viem.sh/docs/actions/wallet/signTransaction
- JSON-RPC Methods:
  - JSON-RPC Accounts: [\`eth_signTransaction\`](https://ethereum.github.io/execution-apis/api-documentation/)
  - Local Accounts: Signs locally. No JSON-RPC request.
@param args - {@link SignTransactionParameters }
@returns The signed message. {@link SignTransactionReturnType }
@example import { createWalletClient, custom } from 'viem'
import { mainnet } from 'viem/chains'

const client = createWalletClient({
  chain: mainnet,
  transport: custom(window.ethereum),
})
const request = await client.prepareTransactionRequest({
  account: '0xA0Cf798816D4b9b9866b5330EEa46a18382f251e',
  to: '0x0000000000000000000000000000000000000000',
  value: 1n,
})
const signature = await client.signTransaction(request)
@example // Account Hoisting
import { createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { mainnet } from 'viem/chains'

const client = createWalletClient({
  account: privateKeyToAccount('0x…'),
  chain: mainnet,
  transport: custom(window.ethereum),
})
const request = await client.prepareTransactionRequest({
  to: '0x0000000000000000000000000000000000000000',
  value: 1n,
})
const signature = await client.signTransaction(request)`,name:"signTransaction",required:!0,type:{name:'<chainOverride extends Chain | undefined, const request extends UnionOmit<ExtractChainFormatterParameters<DeriveChain<Chain | undefined, chainOverride>, "transactionRequest", TransactionRequest>, "from"> = UnionOmit<...>>(args: SignTransactionParameters<...>) => Promise<...>'}},signTypedData:{defaultValue:null,description:`Signs typed data and calculates an Ethereum-specific signature in [EIP-191 format](https://eips.ethereum.org/EIPS/eip-191): \`keccak256("\\x19Ethereum Signed Message:\\n" + len(message) + message))\`.

- Docs: https://viem.sh/docs/actions/wallet/signTypedData
- JSON-RPC Methods:
  - JSON-RPC Accounts: [\`eth_signTypedData_v4\`](https://docs.metamask.io/guide/signing-data#signtypeddata-v4)
  - Local Accounts: Signs locally. No JSON-RPC request.
@param client - Client to use
@param args - {@link SignTypedDataParameters }
@returns The signed data. {@link SignTypedDataReturnType }
@example import { createWalletClient, custom } from 'viem'
import { mainnet } from 'viem/chains'

const client = createWalletClient({
  chain: mainnet,
  transport: custom(window.ethereum),
})
const signature = await client.signTypedData({
  account: '0xA0Cf798816D4b9b9866b5330EEa46a18382f251e',
  domain: {
    name: 'Ether Mail',
    version: '1',
    chainId: 1,
    verifyingContract: '0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC',
  },
  types: {
    Person: [
      { name: 'name', type: 'string' },
      { name: 'wallet', type: 'address' },
    ],
    Mail: [
      { name: 'from', type: 'Person' },
      { name: 'to', type: 'Person' },
      { name: 'contents', type: 'string' },
    ],
  },
  primaryType: 'Mail',
  message: {
    from: {
      name: 'Cow',
      wallet: '0xCD2a3d9F938E13CD947Ec05AbC7FE734Df8DD826',
    },
    to: {
      name: 'Bob',
      wallet: '0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB',
    },
    contents: 'Hello, Bob!',
  },
})
@example // Account Hoisting
import { createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { mainnet } from 'viem/chains'

const client = createWalletClient({
  account: privateKeyToAccount('0x…'),
  chain: mainnet,
  transport: http(),
})
const signature = await client.signTypedData({
  domain: {
    name: 'Ether Mail',
    version: '1',
    chainId: 1,
    verifyingContract: '0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC',
  },
  types: {
    Person: [
      { name: 'name', type: 'string' },
      { name: 'wallet', type: 'address' },
    ],
    Mail: [
      { name: 'from', type: 'Person' },
      { name: 'to', type: 'Person' },
      { name: 'contents', type: 'string' },
    ],
  },
  primaryType: 'Mail',
  message: {
    from: {
      name: 'Cow',
      wallet: '0xCD2a3d9F938E13CD947Ec05AbC7FE734Df8DD826',
    },
    to: {
      name: 'Bob',
      wallet: '0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB',
    },
    contents: 'Hello, Bob!',
  },
})`,name:"signTypedData",required:!0,type:{name:"<const typedData extends { [x: string]: readonly TypedDataParameter[]; [x: `string[${string}]`]: undefined; [x: `function[${string}]`]: undefined; [x: `address[${string}]`]: undefined; [x: `bool[${string}]`]: undefined; [x: `bytes[${string}]`]: undefined; [x: `bytes2[${string}]`]: undefined; [x: `bytes3[${string}]`]..."}},switchChain:{defaultValue:null,description:`Switch the target chain in a wallet.

- Docs: https://viem.sh/docs/actions/wallet/switchChain
- JSON-RPC Methods: [\`eth_switchEthereumChain\`](https://eips.ethereum.org/EIPS/eip-3326)
@param args - {@link SwitchChainParameters }
@example import { createWalletClient, custom } from 'viem'
import { mainnet, optimism } from 'viem/chains'

const client = createWalletClient({
  chain: mainnet,
  transport: custom(window.ethereum),
})
await client.switchChain({ id: optimism.id })`,name:"switchChain",required:!0,type:{name:"(args: SwitchChainParameters) => Promise<void>"}},waitForCallsStatus:{defaultValue:null,description:`Waits for the status & receipts of a call bundle that was sent via \`sendCalls\`.

- Docs: https://viem.sh/docs/actions/wallet/waitForCallsStatus
- JSON-RPC Methods: [\`wallet_getCallsStatus\`](https://eips.ethereum.org/EIPS/eip-5792)
@param client - Client to use
@param parameters - {@link WaitForCallsStatusParameters }
@returns Status & receipts of the call bundle. {@link WaitForCallsStatusReturnType }
@example import { createWalletClient, custom } from 'viem'
import { mainnet } from 'viem/chains'

const client = createWalletClient({
  chain: mainnet,
  transport: custom(window.ethereum),
})

const { receipts, status } = await waitForCallsStatus(client, { id: '0xdeadbeef' })`,name:"waitForCallsStatus",required:!0,type:{name:'(parameters: WaitForCallsStatusParameters) => Promise<{ chainId: number; id: string; atomic: boolean; capabilities?: { [key: string]: any; } | { [x: string]: any; } | undefined; receipts?: WalletCallReceipt<...>[] | undefined; version: string; statusCode: number; status: "success" | ... 2 more ... | undefined; }>'}},watchAsset:{defaultValue:null,description:`Adds an EVM chain to the wallet.

- Docs: https://viem.sh/docs/actions/wallet/watchAsset
- JSON-RPC Methods: [\`eth_switchEthereumChain\`](https://eips.ethereum.org/EIPS/eip-747)
@param args - {@link WatchAssetParameters }
@returns Boolean indicating if the token was successfully added. {@link WatchAssetReturnType }
@example import { createWalletClient, custom } from 'viem'
import { mainnet } from 'viem/chains'

const client = createWalletClient({
  chain: mainnet,
  transport: custom(window.ethereum),
})
const success = await client.watchAsset({
  type: 'ERC20',
  options: {
    address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
    decimals: 18,
    symbol: 'WETH',
  },
})`,name:"watchAsset",required:!0,type:{name:"(args: WatchAssetParams) => Promise<boolean>"}},writeContract:{defaultValue:null,description:`Executes a write function on a contract.

- Docs: https://viem.sh/docs/contract/writeContract
- Examples: https://stackblitz.com/github/wevm/viem/tree/main/examples/contracts_writing-to-contracts

A "write" function on a Solidity contract modifies the state of the blockchain. These types of functions require gas to be executed, and hence a [Transaction](https://viem.sh/docs/glossary/terms) is needed to be broadcast in order to change the state.

Internally, uses a [Wallet Client](https://viem.sh/docs/clients/wallet) to call the [\`sendTransaction\` action](https://viem.sh/docs/actions/wallet/sendTransaction) with [ABI-encoded \`data\`](https://viem.sh/docs/contract/encodeFunctionData).

__Warning: The \`write\` internally sends a transaction – it does not validate if the contract write will succeed (the contract may throw an error). It is highly recommended to [simulate the contract write with \`contract.simulate\`](https://viem.sh/docs/contract/writeContract#usage) before you execute it.__
@param args - {@link WriteContractParameters }
@returns A [Transaction Hash](https://viem.sh/docs/glossary/terms#hash). {@link WriteContractReturnType }
@example import { createWalletClient, custom, parseAbi } from 'viem'
import { mainnet } from 'viem/chains'

const client = createWalletClient({
  chain: mainnet,
  transport: custom(window.ethereum),
})
const hash = await client.writeContract({
  address: '0xFBA3912Ca04dd458c843e2EE08967fC04f3579c2',
  abi: parseAbi(['function mint(uint32 tokenId) nonpayable']),
  functionName: 'mint',
  args: [69420],
})
@example // With Validation
import { createWalletClient, custom, parseAbi } from 'viem'
import { mainnet } from 'viem/chains'

const client = createWalletClient({
  chain: mainnet,
  transport: custom(window.ethereum),
})
const { request } = await client.simulateContract({
  address: '0xFBA3912Ca04dd458c843e2EE08967fC04f3579c2',
  abi: parseAbi(['function mint(uint32 tokenId) nonpayable']),
  functionName: 'mint',
  args: [69420],
}
const hash = await client.writeContract(request)`,name:"writeContract",required:!0,type:{name:'<const abi extends Abi | readonly unknown[], functionName extends ContractFunctionName<abi, "nonpayable" | "payable">, args extends ContractFunctionArgs<abi, "nonpayable" | "payable", functionName>, chainOverride extends Chain | undefined = undefined>(args: WriteContractParameters<...>) => Promise<...>'}},writeContractSync:{defaultValue:null,description:`Executes a write function on a contract synchronously.
Returns the transaction receipt.

- Docs: https://viem.sh/docs/contract/writeContract

A "write" function on a Solidity contract modifies the state of the blockchain. These types of functions require gas to be executed, and hence a [Transaction](https://viem.sh/docs/glossary/terms) is needed to be broadcast in order to change the state.

Internally, uses a [Wallet Client](https://viem.sh/docs/clients/wallet) to call the [\`sendTransaction\` action](https://viem.sh/docs/actions/wallet/sendTransaction) with [ABI-encoded \`data\`](https://viem.sh/docs/contract/encodeFunctionData).

__Warning: The \`write\` internally sends a transaction – it does not validate if the contract write will succeed (the contract may throw an error). It is highly recommended to [simulate the contract write with \`contract.simulate\`](https://viem.sh/docs/contract/writeContract#usage) before you execute it.__
@param args - {@link WriteContractSyncParameters }
@returns A [Transaction Receipt](https://viem.sh/docs/glossary/terms#receipt). {@link WriteContractSyncReturnType }
@example import { createWalletClient, custom, parseAbi } from 'viem'
import { mainnet } from 'viem/chains'

const client = createWalletClient({
  chain: mainnet,
  transport: custom(window.ethereum),
})
const receipt = await client.writeContractSync({
  address: '0xFBA3912Ca04dd458c843e2EE08967fC04f3579c2',
  abi: parseAbi(['function mint(uint32 tokenId) nonpayable']),
  functionName: 'mint',
  args: [69420],
})`,name:"writeContractSync",required:!0,type:{name:'<const abi extends Abi | readonly unknown[], functionName extends ContractFunctionName<abi, "nonpayable" | "payable">, args extends ContractFunctionArgs<abi, "nonpayable" | "payable", functionName>, chainOverride extends Chain | undefined = undefined>(args: WriteContractSyncParameters<...>) => Promise<...>'}},extend:{defaultValue:null,description:"",name:"extend",required:!0,type:{name:"<const client extends { [x: string]: unknown; account?: undefined; batch?: undefined; cacheTime?: undefined; ccipRead?: undefined; chain?: undefined; experimental_blockTag?: undefined; key?: undefined; name?: undefined; pollingInterval?: undefined; request?: undefined; transport?: undefined; type?: undefined; uid?: ..."}}}}}catch{}const Un=(e,t)=>{const n={},a=Array.from(new Set([...Object.keys(t),...Object.keys(e)]));for(const s of a){if(!t[s]){n[s]=e[s];continue}const r=Object.fromEntries(Object.entries(t[s]).map(([i,c])=>[i,{...c,external:!0}]));n[s]={...e[s],...r}}return n},Jn=()=>{const t={...Un(se,ie)},n=ln(31337);if(n!==31337){const a=ie[n];if(a){const s=Object.fromEntries(Object.entries(a).map(([i,c])=>[i,{...c,external:!0}])),r=se[31337]||{};t[31337]={...r,...s}}}return t},Gn=Jn(),fa=Gn;var Kn=(e=>(e[e.LOADING=0]="LOADING",e[e.DEPLOYED=1]="DEPLOYED",e[e.NOT_FOUND=2]="NOT_FOUND",e))(Kn||{});export{ia as A,sa as B,Kn as C,la as M,bn as a,ua as b,fa as c,ca as d,oa as e,ra as f,ln as g,Kt as h,ma as i,Pe as j,Ee as k,$n as l,de as m,m as n,pa as o,da as s,ha as u,W as w};
