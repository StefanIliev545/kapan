import{j as e}from"./jsx-runtime-CcWEvojh.js";import{P as o}from"./ProtocolDropdownItem-DLoI1xHs.js";import"./index-kA4PVysc.js";import"./index-Bk_d_yAU.js";import"./_commonjsHelpers-CE1G-McA.js";import"./next-image-DV_ejeD4.js";import"./protocol-B00D1UZQ.js";import"./externalContracts-_f_8pMJw.js";import"./formatPercentage-BDNxS5DB.js";const r=()=>{},y={title:"Common/ProtocolDropdownItem",component:o,parameters:{layout:"centered"},tags:["autodocs"]},a={render:()=>e.jsx("div",{className:"w-80 bg-base-100 rounded-lg border border-base-200",children:e.jsx(o,{protocolName:"aave",displayName:"Aave V3",rate:3.5,onClick:r})})},s={render:()=>e.jsx("div",{className:"w-80 bg-base-100 rounded-lg border border-base-200",children:e.jsx(o,{protocolName:"compound",displayName:"Compound V3",rate:4.2,isOptimal:!0,onClick:r})})},d={render:()=>e.jsx("div",{className:"w-80 bg-base-100 rounded-lg border border-base-200",children:e.jsx(o,{protocolName:"compound",displayName:"Compound V3",rate:5.1,isRateBetter:!0,onClick:r})})},t={render:()=>e.jsx("div",{className:"w-80 bg-base-100 rounded-lg border border-base-200",children:e.jsx(o,{protocolName:"morpho",displayName:"Morpho Blue",rate:2.8,isRateWorse:!0,onClick:r})})},n={render:()=>e.jsx("div",{className:"w-80 bg-base-100 rounded-lg border border-base-200",children:e.jsx(o,{protocolName:"aave",displayName:"Aave V3",rate:3.5,isSelected:!0,onClick:r})})},l={render:()=>e.jsx("div",{className:"w-80 bg-base-100 rounded-lg border border-base-200",children:e.jsx(o,{protocolName:"venus",displayName:"Venus",rate:3.2,disabled:!0,disabledReason:"Insufficient liquidity",onClick:r})})},c={render:()=>e.jsx("div",{className:"w-80 bg-base-100 rounded-lg border border-base-200",children:e.jsx(o,{protocolName:"zerolend",displayName:"ZeroLend",onClick:r})})},i={render:()=>e.jsxs("div",{className:"w-80 bg-base-100 rounded-lg border border-base-200 overflow-hidden",children:[e.jsx(o,{protocolName:"compound",displayName:"Compound V3",rate:4.2,isOptimal:!0,onClick:r}),e.jsx(o,{protocolName:"aave",displayName:"Aave V3",rate:3.5,isSelected:!0,onClick:r}),e.jsx(o,{protocolName:"morpho",displayName:"Morpho Blue",rate:2.8,isRateWorse:!0,onClick:r}),e.jsx(o,{protocolName:"venus",displayName:"Venus",rate:3,disabled:!0,disabledReason:"Not available on this chain",onClick:r})]})};a.parameters={...a.parameters,docs:{...a.parameters?.docs,source:{originalSource:`{
  render: () => <div className="w-80 bg-base-100 rounded-lg border border-base-200">
      <ProtocolDropdownItem protocolName="aave" displayName="Aave V3" rate={3.5} onClick={noop} />
    </div>
}`,...a.parameters?.docs?.source}}};s.parameters={...s.parameters,docs:{...s.parameters?.docs,source:{originalSource:`{
  render: () => <div className="w-80 bg-base-100 rounded-lg border border-base-200">
      <ProtocolDropdownItem protocolName="compound" displayName="Compound V3" rate={4.2} isOptimal onClick={noop} />
    </div>
}`,...s.parameters?.docs?.source}}};d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  render: () => <div className="w-80 bg-base-100 rounded-lg border border-base-200">
      <ProtocolDropdownItem protocolName="compound" displayName="Compound V3" rate={5.1} isRateBetter onClick={noop} />
    </div>
}`,...d.parameters?.docs?.source}}};t.parameters={...t.parameters,docs:{...t.parameters?.docs,source:{originalSource:`{
  render: () => <div className="w-80 bg-base-100 rounded-lg border border-base-200">
      <ProtocolDropdownItem protocolName="morpho" displayName="Morpho Blue" rate={2.8} isRateWorse onClick={noop} />
    </div>
}`,...t.parameters?.docs?.source}}};n.parameters={...n.parameters,docs:{...n.parameters?.docs,source:{originalSource:`{
  render: () => <div className="w-80 bg-base-100 rounded-lg border border-base-200">
      <ProtocolDropdownItem protocolName="aave" displayName="Aave V3" rate={3.5} isSelected onClick={noop} />
    </div>
}`,...n.parameters?.docs?.source}}};l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  render: () => <div className="w-80 bg-base-100 rounded-lg border border-base-200">
      <ProtocolDropdownItem protocolName="venus" displayName="Venus" rate={3.2} disabled disabledReason="Insufficient liquidity" onClick={noop} />
    </div>
}`,...l.parameters?.docs?.source}}};c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{
  render: () => <div className="w-80 bg-base-100 rounded-lg border border-base-200">
      <ProtocolDropdownItem protocolName="zerolend" displayName="ZeroLend" onClick={noop} />
    </div>
}`,...c.parameters?.docs?.source}}};i.parameters={...i.parameters,docs:{...i.parameters?.docs,source:{originalSource:`{
  render: () => <div className="w-80 bg-base-100 rounded-lg border border-base-200 overflow-hidden">
      <ProtocolDropdownItem protocolName="compound" displayName="Compound V3" rate={4.2} isOptimal onClick={noop} />
      <ProtocolDropdownItem protocolName="aave" displayName="Aave V3" rate={3.5} isSelected onClick={noop} />
      <ProtocolDropdownItem protocolName="morpho" displayName="Morpho Blue" rate={2.8} isRateWorse onClick={noop} />
      <ProtocolDropdownItem protocolName="venus" displayName="Venus" rate={3.0} disabled disabledReason="Not available on this chain" onClick={noop} />
    </div>
}`,...i.parameters?.docs?.source}}};const x=["Default","Optimal","BetterRate","WorseRate","Selected","Disabled","NoRate","MultipleItems"];export{d as BetterRate,a as Default,l as Disabled,i as MultipleItems,c as NoRate,s as Optimal,n as Selected,t as WorseRate,x as __namedExportsOrder,y as default};
