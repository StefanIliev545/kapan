import{j as e}from"./jsx-runtime-CcWEvojh.js";import{L as s,a as p,B as g,b as m,S as x,c as u,d as S,e as v}from"./Loading-Bz06Coe0.js";import"./index-kA4PVysc.js";import"./clsx-B-dksMZM.js";const f={title:"Common/Loading",component:s,parameters:{layout:"centered"},tags:["autodocs"]},a={args:{size:"md"}},n={args:{size:"md",label:"Loading data..."}},r={render:()=>e.jsxs("div",{className:"flex items-center gap-4",children:[e.jsx(s,{size:"xs"}),e.jsx(s,{size:"sm"}),e.jsx(s,{size:"md"}),e.jsx(s,{size:"lg"})]})},o={render:()=>e.jsx("div",{className:"w-64",children:e.jsx(p,{label:"Loading content..."})})},i={render:()=>e.jsxs("button",{className:"btn btn-primary flex items-center gap-2",children:[e.jsx(g,{size:"xs"}),"Processing..."]})},t={render:()=>e.jsx("div",{className:"w-80",children:e.jsx(m,{message:"Fetching quote from 1inch..."})})},c={render:()=>e.jsxs("div",{className:"flex flex-col gap-2 w-80",children:[e.jsx(m,{message:"Info loading...",variant:"info"}),e.jsx(m,{message:"Warning loading...",variant:"warning"}),e.jsx(m,{message:"Neutral loading...",variant:"neutral"})]})},d={render:()=>e.jsxs("div",{className:"flex flex-col gap-4 w-80",children:[e.jsxs("div",{children:[e.jsx("p",{className:"text-sm mb-2",children:"SkeletonLine:"}),e.jsx(x,{width:"w-32"})]}),e.jsxs("div",{children:[e.jsx("p",{className:"text-sm mb-2",children:"SkeletonCircle:"}),e.jsx(u,{})]}),e.jsxs("div",{children:[e.jsx("p",{className:"text-sm mb-2",children:"SkeletonRow:"}),e.jsx(S,{})]})]})},l={render:()=>e.jsx("div",{className:"w-96",children:e.jsx(v,{title:"Markets",rows:3})})};a.parameters={...a.parameters,docs:{...a.parameters?.docs,source:{originalSource:`{
  args: {
    size: "md"
  }
}`,...a.parameters?.docs?.source}}};n.parameters={...n.parameters,docs:{...n.parameters?.docs,source:{originalSource:`{
  args: {
    size: "md",
    label: "Loading data..."
  }
}`,...n.parameters?.docs?.source}}};r.parameters={...r.parameters,docs:{...r.parameters?.docs,source:{originalSource:`{
  render: () => <div className="flex items-center gap-4">
      <LoadingSpinner size="xs" />
      <LoadingSpinner size="sm" />
      <LoadingSpinner size="md" />
      <LoadingSpinner size="lg" />
    </div>
}`,...r.parameters?.docs?.source}}};o.parameters={...o.parameters,docs:{...o.parameters?.docs,source:{originalSource:`{
  render: () => <div className="w-64">
      <LoadingOverlay label="Loading content..." />
    </div>
}`,...o.parameters?.docs?.source}}};i.parameters={...i.parameters,docs:{...i.parameters?.docs,source:{originalSource:`{
  render: () => <button className="btn btn-primary flex items-center gap-2">
      <ButtonLoading size="xs" />
      Processing...
    </button>
}`,...i.parameters?.docs?.source}}};t.parameters={...t.parameters,docs:{...t.parameters?.docs,source:{originalSource:`{
  render: () => <div className="w-80">
      <LoadingAlert message="Fetching quote from 1inch..." />
    </div>
}`,...t.parameters?.docs?.source}}};c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{
  render: () => <div className="flex flex-col gap-2 w-80">
      <LoadingAlert message="Info loading..." variant="info" />
      <LoadingAlert message="Warning loading..." variant="warning" />
      <LoadingAlert message="Neutral loading..." variant="neutral" />
    </div>
}`,...c.parameters?.docs?.source}}};d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  render: () => <div className="flex flex-col gap-4 w-80">
      <div>
        <p className="text-sm mb-2">SkeletonLine:</p>
        <SkeletonLine width="w-32" />
      </div>
      <div>
        <p className="text-sm mb-2">SkeletonCircle:</p>
        <SkeletonCircle />
      </div>
      <div>
        <p className="text-sm mb-2">SkeletonRow:</p>
        <SkeletonRow />
      </div>
    </div>
}`,...d.parameters?.docs?.source}}};l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  render: () => <div className="w-96">
      <SectionLoading title="Markets" rows={3} />
    </div>
}`,...l.parameters?.docs?.source}}};const h=["Spinner","SpinnerWithLabel","SpinnerSizes","Overlay","ButtonLoadingIndicator","Alert","AlertVariants","Skeletons","Section"];export{t as Alert,c as AlertVariants,i as ButtonLoadingIndicator,o as Overlay,l as Section,d as Skeletons,a as Spinner,r as SpinnerSizes,n as SpinnerWithLabel,h as __namedExportsOrder,f as default};
