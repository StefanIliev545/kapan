import{j as e}from"./jsx-runtime-CcWEvojh.js";import{B as c}from"./BaseModal-BD505zqX.js";import"./index-kA4PVysc.js";import"./XMarkIcon-BMRVPuHu.js";import"./index-Bk_d_yAU.js";import"./_commonjsHelpers-CE1G-McA.js";const s=()=>{},h={title:"Modals/BaseModal",component:c,parameters:{layout:"fullscreen"}},n={args:{isOpen:!0,onClose:s,title:"Confirm Action",children:e.jsxs("div",{className:"space-y-4",children:[e.jsx("p",{className:"text-base-content/70",children:"Are you sure you want to proceed with this action? This cannot be undone."}),e.jsxs("div",{className:"flex justify-end gap-2",children:[e.jsx("button",{className:"btn btn-ghost",children:"Cancel"}),e.jsx("button",{className:"btn btn-primary",children:"Confirm"})]})]})}},a={args:{isOpen:!0,onClose:s,children:e.jsxs("div",{className:"space-y-4 pt-4",children:[e.jsxs("div",{className:"flex items-center gap-3",children:[e.jsx("div",{className:"size-12 rounded-full bg-success/20 flex items-center justify-center",children:e.jsx("span",{className:"text-2xl",children:"✓"})}),e.jsxs("div",{children:[e.jsx("h3",{className:"font-semibold",children:"Transaction Successful"}),e.jsx("p",{className:"text-sm text-base-content/70",children:"Your deposit has been confirmed"})]})]}),e.jsx("button",{className:"btn btn-primary w-full",children:"Close"})]})}},t={args:{isOpen:!0,onClose:s,title:"Select Token",maxWidthClass:"max-w-2xl",children:e.jsx("div",{className:"space-y-2",children:["USDC","WETH","WBTC","DAI","USDT"].map(i=>e.jsxs("button",{className:"btn btn-ghost w-full justify-start gap-3",children:[e.jsx("div",{className:"size-8 rounded-full bg-base-300"}),e.jsx("span",{children:i})]},i))})}},r={args:{isOpen:!0,onClose:s,title:"Processing",children:e.jsxs("div",{className:"flex flex-col items-center gap-4 py-8",children:[e.jsx("span",{className:"loading loading-spinner loading-lg"}),e.jsx("p",{className:"text-base-content/70",children:"Waiting for confirmation..."})]})}},o={args:{isOpen:!0,onClose:s,title:"Transaction Failed",children:e.jsxs("div",{className:"space-y-4",children:[e.jsx("div",{className:"alert alert-error",children:e.jsx("span",{children:"User rejected the transaction"})}),e.jsx("button",{className:"btn btn-error w-full",children:"Try Again"})]})}};n.parameters={...n.parameters,docs:{...n.parameters?.docs,source:{originalSource:`{
  args: {
    isOpen: true,
    onClose: noop,
    title: "Confirm Action",
    children: <div className="space-y-4">
        <p className="text-base-content/70">
          Are you sure you want to proceed with this action? This cannot be undone.
        </p>
        <div className="flex justify-end gap-2">
          <button className="btn btn-ghost">Cancel</button>
          <button className="btn btn-primary">Confirm</button>
        </div>
      </div>
  }
}`,...n.parameters?.docs?.source}}};a.parameters={...a.parameters,docs:{...a.parameters?.docs,source:{originalSource:`{
  args: {
    isOpen: true,
    onClose: noop,
    children: <div className="space-y-4 pt-4">
        <div className="flex items-center gap-3">
          <div className="size-12 rounded-full bg-success/20 flex items-center justify-center">
            <span className="text-2xl">✓</span>
          </div>
          <div>
            <h3 className="font-semibold">Transaction Successful</h3>
            <p className="text-sm text-base-content/70">Your deposit has been confirmed</p>
          </div>
        </div>
        <button className="btn btn-primary w-full">Close</button>
      </div>
  }
}`,...a.parameters?.docs?.source}}};t.parameters={...t.parameters,docs:{...t.parameters?.docs,source:{originalSource:`{
  args: {
    isOpen: true,
    onClose: noop,
    title: "Select Token",
    maxWidthClass: "max-w-2xl",
    children: <div className="space-y-2">
        {["USDC", "WETH", "WBTC", "DAI", "USDT"].map(token => <button key={token} className="btn btn-ghost w-full justify-start gap-3">
            <div className="size-8 rounded-full bg-base-300" />
            <span>{token}</span>
          </button>)}
      </div>
  }
}`,...t.parameters?.docs?.source}}};r.parameters={...r.parameters,docs:{...r.parameters?.docs,source:{originalSource:`{
  args: {
    isOpen: true,
    onClose: noop,
    title: "Processing",
    children: <div className="flex flex-col items-center gap-4 py-8">
        <span className="loading loading-spinner loading-lg" />
        <p className="text-base-content/70">Waiting for confirmation...</p>
      </div>
  }
}`,...r.parameters?.docs?.source}}};o.parameters={...o.parameters,docs:{...o.parameters?.docs,source:{originalSource:`{
  args: {
    isOpen: true,
    onClose: noop,
    title: "Transaction Failed",
    children: <div className="space-y-4">
        <div className="alert alert-error">
          <span>User rejected the transaction</span>
        </div>
        <button className="btn btn-error w-full">Try Again</button>
      </div>
  }
}`,...o.parameters?.docs?.source}}};const b=["WithTitle","WithoutTitle","Wide","Loading","Error"];export{o as Error,r as Loading,t as Wide,n as WithTitle,a as WithoutTitle,b as __namedExportsOrder,h as default};
