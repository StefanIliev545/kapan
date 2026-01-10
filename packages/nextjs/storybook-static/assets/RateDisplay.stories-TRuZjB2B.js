import{j as e}from"./jsx-runtime-CcWEvojh.js";import{R as s,S as v,B as N,N as x}from"./RateDisplay-DQIxemgf.js";import"./index-kA4PVysc.js";import"./clsx-B-dksMZM.js";import"./formatPercentage-BDNxS5DB.js";const f={title:"Common/RateDisplay",component:s,parameters:{layout:"centered"},tags:["autodocs"]},a={args:{rate:3.5,type:"apy"}},t={args:{rate:-2.1,type:"net",variant:"auto",showSign:!0}},r={args:{rate:0,type:"apy"}},n={args:{rate:4.2,type:"apr",showLabel:!0,labelPosition:"before"}},l={render:()=>e.jsxs("div",{className:"flex flex-col gap-4",children:[e.jsxs("div",{children:[e.jsx("p",{className:"text-sm mb-2",children:"Label before:"}),e.jsx(s,{rate:3.5,type:"apy",showLabel:!0,labelPosition:"before"})]}),e.jsxs("div",{children:[e.jsx("p",{className:"text-sm mb-2",children:"Label after:"}),e.jsx(s,{rate:3.5,type:"apy",showLabel:!0,labelPosition:"after"})]}),e.jsxs("div",{children:[e.jsx("p",{className:"text-sm mb-2",children:"Label above:"}),e.jsx(s,{rate:3.5,type:"apy",showLabel:!0,labelPosition:"above"})]})]})},i={render:()=>e.jsxs("div",{className:"flex flex-col gap-4",children:[e.jsxs("div",{className:"flex items-baseline gap-4",children:[e.jsx("span",{className:"text-sm w-12",children:"xs:"}),e.jsx(s,{rate:3.5,size:"xs"})]}),e.jsxs("div",{className:"flex items-baseline gap-4",children:[e.jsx("span",{className:"text-sm w-12",children:"sm:"}),e.jsx(s,{rate:3.5,size:"sm"})]}),e.jsxs("div",{className:"flex items-baseline gap-4",children:[e.jsx("span",{className:"text-sm w-12",children:"md:"}),e.jsx(s,{rate:3.5,size:"md"})]}),e.jsxs("div",{className:"flex items-baseline gap-4",children:[e.jsx("span",{className:"text-sm w-12",children:"lg:"}),e.jsx(s,{rate:3.5,size:"lg"})]}),e.jsxs("div",{className:"flex items-baseline gap-4",children:[e.jsx("span",{className:"text-sm w-12",children:"xl:"}),e.jsx(s,{rate:3.5,size:"xl"})]})]})},m={render:()=>e.jsxs("div",{className:"flex flex-col gap-4",children:[e.jsxs("div",{className:"flex items-baseline gap-4",children:[e.jsx("span",{className:"text-sm w-16",children:"default:"}),e.jsx(s,{rate:3.5,variant:"default"})]}),e.jsxs("div",{className:"flex items-baseline gap-4",children:[e.jsx("span",{className:"text-sm w-16",children:"success:"}),e.jsx(s,{rate:3.5,variant:"success"})]}),e.jsxs("div",{className:"flex items-baseline gap-4",children:[e.jsx("span",{className:"text-sm w-16",children:"error:"}),e.jsx(s,{rate:3.5,variant:"error"})]}),e.jsxs("div",{className:"flex items-baseline gap-4",children:[e.jsx("span",{className:"text-sm w-16",children:"muted:"}),e.jsx(s,{rate:3.5,variant:"muted"})]}),e.jsxs("div",{className:"flex items-baseline gap-4",children:[e.jsx("span",{className:"text-sm w-16",children:"auto (+):"}),e.jsx(s,{rate:3.5,variant:"auto"})]}),e.jsxs("div",{className:"flex items-baseline gap-4",children:[e.jsx("span",{className:"text-sm w-16",children:"auto (-):"}),e.jsx(s,{rate:-2.1,variant:"auto"})]})]})},o={args:{rate:3.2,oldRate:4.8,type:"apr",showLabel:!0,label:"Borrow APR"}},c={render:()=>e.jsxs("div",{className:"flex flex-col gap-4",children:[e.jsxs("div",{className:"flex items-baseline gap-4",children:[e.jsx("span",{className:"text-sm w-24",children:"Positive:"}),e.jsx(s,{rate:2.1,type:"net",variant:"auto",showSign:!0})]}),e.jsxs("div",{className:"flex items-baseline gap-4",children:[e.jsx("span",{className:"text-sm w-24",children:"Negative:"}),e.jsx(s,{rate:-1.5,type:"net",variant:"auto",showSign:!0})]}),e.jsxs("div",{className:"flex items-baseline gap-4",children:[e.jsx("span",{className:"text-sm w-24",children:"Zero:"}),e.jsx(s,{rate:0,type:"net",variant:"auto",showSign:!0})]})]})},p={render:()=>e.jsxs("div",{className:"flex flex-col gap-4",children:[e.jsxs("div",{children:[e.jsx("p",{className:"text-sm mb-2",children:"SupplyAPY:"}),e.jsx(v,{rate:5.2,showLabel:!0})]}),e.jsxs("div",{children:[e.jsx("p",{className:"text-sm mb-2",children:"BorrowAPR:"}),e.jsx(N,{rate:4.8,showLabel:!0})]}),e.jsxs("div",{children:[e.jsx("p",{className:"text-sm mb-2",children:"NetAPY (positive):"}),e.jsx(x,{rate:.4,showLabel:!0})]}),e.jsxs("div",{children:[e.jsx("p",{className:"text-sm mb-2",children:"NetAPY (negative):"}),e.jsx(x,{rate:-.6,showLabel:!0})]})]})},d={args:{rate:3.14159,decimals:4,type:"apy",showLabel:!0}};a.parameters={...a.parameters,docs:{...a.parameters?.docs,source:{originalSource:`{
  args: {
    rate: 3.5,
    type: "apy"
  }
}`,...a.parameters?.docs?.source}}};t.parameters={...t.parameters,docs:{...t.parameters?.docs,source:{originalSource:`{
  args: {
    rate: -2.1,
    type: "net",
    variant: "auto",
    showSign: true
  }
}`,...t.parameters?.docs?.source}}};r.parameters={...r.parameters,docs:{...r.parameters?.docs,source:{originalSource:`{
  args: {
    rate: 0,
    type: "apy"
  }
}`,...r.parameters?.docs?.source}}};n.parameters={...n.parameters,docs:{...n.parameters?.docs,source:{originalSource:`{
  args: {
    rate: 4.2,
    type: "apr",
    showLabel: true,
    labelPosition: "before"
  }
}`,...n.parameters?.docs?.source}}};l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  render: () => <div className="flex flex-col gap-4">
      <div>
        <p className="text-sm mb-2">Label before:</p>
        <RateDisplay rate={3.5} type="apy" showLabel labelPosition="before" />
      </div>
      <div>
        <p className="text-sm mb-2">Label after:</p>
        <RateDisplay rate={3.5} type="apy" showLabel labelPosition="after" />
      </div>
      <div>
        <p className="text-sm mb-2">Label above:</p>
        <RateDisplay rate={3.5} type="apy" showLabel labelPosition="above" />
      </div>
    </div>
}`,...l.parameters?.docs?.source}}};i.parameters={...i.parameters,docs:{...i.parameters?.docs,source:{originalSource:`{
  render: () => <div className="flex flex-col gap-4">
      <div className="flex items-baseline gap-4">
        <span className="text-sm w-12">xs:</span>
        <RateDisplay rate={3.5} size="xs" />
      </div>
      <div className="flex items-baseline gap-4">
        <span className="text-sm w-12">sm:</span>
        <RateDisplay rate={3.5} size="sm" />
      </div>
      <div className="flex items-baseline gap-4">
        <span className="text-sm w-12">md:</span>
        <RateDisplay rate={3.5} size="md" />
      </div>
      <div className="flex items-baseline gap-4">
        <span className="text-sm w-12">lg:</span>
        <RateDisplay rate={3.5} size="lg" />
      </div>
      <div className="flex items-baseline gap-4">
        <span className="text-sm w-12">xl:</span>
        <RateDisplay rate={3.5} size="xl" />
      </div>
    </div>
}`,...i.parameters?.docs?.source}}};m.parameters={...m.parameters,docs:{...m.parameters?.docs,source:{originalSource:`{
  render: () => <div className="flex flex-col gap-4">
      <div className="flex items-baseline gap-4">
        <span className="text-sm w-16">default:</span>
        <RateDisplay rate={3.5} variant="default" />
      </div>
      <div className="flex items-baseline gap-4">
        <span className="text-sm w-16">success:</span>
        <RateDisplay rate={3.5} variant="success" />
      </div>
      <div className="flex items-baseline gap-4">
        <span className="text-sm w-16">error:</span>
        <RateDisplay rate={3.5} variant="error" />
      </div>
      <div className="flex items-baseline gap-4">
        <span className="text-sm w-16">muted:</span>
        <RateDisplay rate={3.5} variant="muted" />
      </div>
      <div className="flex items-baseline gap-4">
        <span className="text-sm w-16">auto (+):</span>
        <RateDisplay rate={3.5} variant="auto" />
      </div>
      <div className="flex items-baseline gap-4">
        <span className="text-sm w-16">auto (-):</span>
        <RateDisplay rate={-2.1} variant="auto" />
      </div>
    </div>
}`,...m.parameters?.docs?.source}}};o.parameters={...o.parameters,docs:{...o.parameters?.docs,source:{originalSource:`{
  args: {
    rate: 3.2,
    oldRate: 4.8,
    type: "apr",
    showLabel: true,
    label: "Borrow APR"
  }
}`,...o.parameters?.docs?.source}}};c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{
  render: () => <div className="flex flex-col gap-4">
      <div className="flex items-baseline gap-4">
        <span className="text-sm w-24">Positive:</span>
        <RateDisplay rate={2.1} type="net" variant="auto" showSign />
      </div>
      <div className="flex items-baseline gap-4">
        <span className="text-sm w-24">Negative:</span>
        <RateDisplay rate={-1.5} type="net" variant="auto" showSign />
      </div>
      <div className="flex items-baseline gap-4">
        <span className="text-sm w-24">Zero:</span>
        <RateDisplay rate={0} type="net" variant="auto" showSign />
      </div>
    </div>
}`,...c.parameters?.docs?.source}}};p.parameters={...p.parameters,docs:{...p.parameters?.docs,source:{originalSource:`{
  render: () => <div className="flex flex-col gap-4">
      <div>
        <p className="text-sm mb-2">SupplyAPY:</p>
        <SupplyAPY rate={5.2} showLabel />
      </div>
      <div>
        <p className="text-sm mb-2">BorrowAPR:</p>
        <BorrowAPR rate={4.8} showLabel />
      </div>
      <div>
        <p className="text-sm mb-2">NetAPY (positive):</p>
        <NetAPY rate={0.4} showLabel />
      </div>
      <div>
        <p className="text-sm mb-2">NetAPY (negative):</p>
        <NetAPY rate={-0.6} showLabel />
      </div>
    </div>
}`,...p.parameters?.docs?.source}}};d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  args: {
    rate: 3.14159,
    decimals: 4,
    type: "apy",
    showLabel: true
  }
}`,...d.parameters?.docs?.source}}};const w=["PositiveRate","NegativeRate","ZeroRate","WithLabel","LabelPositions","Sizes","Variants","RateComparison","NetAPYAutoColor","ShorthandComponents","CustomDecimals"];export{d as CustomDecimals,l as LabelPositions,t as NegativeRate,c as NetAPYAutoColor,a as PositiveRate,o as RateComparison,p as ShorthandComponents,i as Sizes,m as Variants,n as WithLabel,r as ZeroRate,w as __namedExportsOrder,f as default};
