import{j as e}from"./jsx-runtime-CcWEvojh.js";import{E as r,W as p,I as u}from"./ErrorDisplay-1gvgOhys.js";import"./index-kA4PVysc.js";import"./ExclamationTriangleIcon-CGJHvwPy.js";import"./index-Bk_d_yAU.js";import"./_commonjsHelpers-CE1G-McA.js";import"./InformationCircleIcon-uxtQsYC6.js";const j={title:"Common/ErrorDisplay",component:r,parameters:{layout:"centered"},tags:["autodocs"]},s={args:{message:"Transaction failed. Please try again.",variant:"error"}},a={args:{message:"Output may not cover the full amount",variant:"warning"}},n={args:{message:"Your transaction is being processed",variant:"info"}},o={args:{message:"Invalid amount entered",variant:"inline"}},i={render:()=>e.jsxs("div",{className:"flex flex-col gap-4 w-96",children:[e.jsx(r,{message:"Small error message",size:"sm"}),e.jsx(r,{message:"Medium error message (default)",size:"md"}),e.jsx(r,{message:"Large error message with shadow",size:"lg"})]})},t={render:()=>e.jsxs("div",{className:"flex flex-col gap-4 w-96",children:[e.jsx(r,{message:"This is an error message",variant:"error"}),e.jsx(r,{message:"This is a warning message",variant:"warning"}),e.jsx(r,{message:"This is an info message",variant:"info"}),e.jsx(r,{message:"This is an inline error",variant:"inline"})]})},m={args:{message:"The transaction could not be completed because the network is congested. Please wait a few minutes and try again. If the problem persists, contact support.",variant:"error",breakAll:!0}},c={args:{message:"Error without icon",variant:"error",hideIcon:!0}},d={render:()=>e.jsx("div",{className:"w-80",children:e.jsx(p,{message:"This uses the WarningDisplay shorthand"})})},g={render:()=>e.jsx("div",{className:"w-80",children:e.jsx(u,{message:"This uses the InfoDisplay shorthand"})})},l={render:()=>e.jsx("div",{className:"w-80",children:e.jsx(r,{message:new s("Error object message is extracted")})})};s.parameters={...s.parameters,docs:{...s.parameters?.docs,source:{originalSource:`{
  args: {
    message: "Transaction failed. Please try again.",
    variant: "error"
  }
}`,...s.parameters?.docs?.source}}};a.parameters={...a.parameters,docs:{...a.parameters?.docs,source:{originalSource:`{
  args: {
    message: "Output may not cover the full amount",
    variant: "warning"
  }
}`,...a.parameters?.docs?.source}}};n.parameters={...n.parameters,docs:{...n.parameters?.docs,source:{originalSource:`{
  args: {
    message: "Your transaction is being processed",
    variant: "info"
  }
}`,...n.parameters?.docs?.source}}};o.parameters={...o.parameters,docs:{...o.parameters?.docs,source:{originalSource:`{
  args: {
    message: "Invalid amount entered",
    variant: "inline"
  }
}`,...o.parameters?.docs?.source}}};i.parameters={...i.parameters,docs:{...i.parameters?.docs,source:{originalSource:`{
  render: () => <div className="flex flex-col gap-4 w-96">
      <ErrorDisplay message="Small error message" size="sm" />
      <ErrorDisplay message="Medium error message (default)" size="md" />
      <ErrorDisplay message="Large error message with shadow" size="lg" />
    </div>
}`,...i.parameters?.docs?.source}}};t.parameters={...t.parameters,docs:{...t.parameters?.docs,source:{originalSource:`{
  render: () => <div className="flex flex-col gap-4 w-96">
      <ErrorDisplay message="This is an error message" variant="error" />
      <ErrorDisplay message="This is a warning message" variant="warning" />
      <ErrorDisplay message="This is an info message" variant="info" />
      <ErrorDisplay message="This is an inline error" variant="inline" />
    </div>
}`,...t.parameters?.docs?.source}}};m.parameters={...m.parameters,docs:{...m.parameters?.docs,source:{originalSource:`{
  args: {
    message: "The transaction could not be completed because the network is congested. Please wait a few minutes and try again. If the problem persists, contact support.",
    variant: "error",
    breakAll: true
  }
}`,...m.parameters?.docs?.source}}};c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{
  args: {
    message: "Error without icon",
    variant: "error",
    hideIcon: true
  }
}`,...c.parameters?.docs?.source}}};d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  render: () => <div className="w-80">
      <WarningDisplay message="This uses the WarningDisplay shorthand" />
    </div>
}`,...d.parameters?.docs?.source}}};g.parameters={...g.parameters,docs:{...g.parameters?.docs,source:{originalSource:`{
  render: () => <div className="w-80">
      <InfoDisplay message="This uses the InfoDisplay shorthand" />
    </div>
}`,...g.parameters?.docs?.source}}};l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  render: () => <div className="w-80">
      <ErrorDisplay message={new Error("Error object message is extracted")} />
    </div>
}`,...l.parameters?.docs?.source}}};const I=["Error","Warning","Info","Inline","Sizes","AllVariants","LongMessage","NoIcon","WarningShorthand","InfoShorthand","ErrorObject"];export{t as AllVariants,s as Error,l as ErrorObject,n as Info,g as InfoShorthand,o as Inline,m as LongMessage,c as NoIcon,i as Sizes,a as Warning,d as WarningShorthand,I as __namedExportsOrder,j as default};
