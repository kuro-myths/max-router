import { githubFetch, safeGitHubError } from "../../../../lib/githubConnector.js";

const definitions = [
  { type:"function", function:{ name:"github_list_repositories", description:"List accessible GitHub repositories, including private repositories.", parameters:{type:"object",properties:{page:{type:"integer",minimum:1},per_page:{type:"integer",minimum:1,maximum:100}},additionalProperties:false} } },
  { type:"function", function:{ name:"github_list_files", description:"List files and directories at a repository path.", parameters:{type:"object",properties:{owner:{type:"string"},repo:{type:"string"},path:{type:"string"},branch:{type:"string"}},required:["owner","repo"],additionalProperties:false} } },
  { type:"function", function:{ name:"github_read_file", description:"Read UTF-8 text source code from a repository file.", parameters:{type:"object",properties:{owner:{type:"string"},repo:{type:"string"},path:{type:"string"},branch:{type:"string"}},required:["owner","repo","path"],additionalProperties:false} } },
  { type:"function", function:{ name:"github_list_branches", description:"List branches for a repository.", parameters:{type:"object",properties:{owner:{type:"string"},repo:{type:"string"}},required:["owner","repo"],additionalProperties:false} } },
  { type:"function", function:{ name:"github_create_branch", description:"Create a new branch from an existing branch. Requires user confirmation.", parameters:{type:"object",properties:{owner:{type:"string"},repo:{type:"string"},branch:{type:"string"},from:{type:"string"}},required:["owner","repo","branch"],additionalProperties:false} } },
  { type:"function", function:{ name:"github_update_file", description:"Create or update a UTF-8 text file on a branch. Requires user confirmation and current blob SHA when updating.", parameters:{type:"object",properties:{owner:{type:"string"},repo:{type:"string"},path:{type:"string"},content:{type:"string"},sha:{type:"string"},branch:{type:"string"},message:{type:"string"}},required:["owner","repo","path","content","branch","message"],additionalProperties:false} } },
  { type:"function", function:{ name:"github_create_pull_request", description:"Create a pull request from a working branch to a base branch. Requires user confirmation.", parameters:{type:"object",properties:{owner:{type:"string"},repo:{type:"string"},title:{type:"string"},body:{type:"string"},head:{type:"string"},base:{type:"string"},draft:{type:"boolean"}},required:["owner","repo","title","head","base"],additionalProperties:false} } }
];
const validPart=(v)=>typeof v==="string"&&/^[A-Za-z0-9_.-]{1,100}$/.test(v)&&v!=="."&&v!=="..";
const validPath=(v)=>typeof v==="string"&&v.length<=1000&&(v===""||!v.split("/").some(p=>!p||p==="."||p===".."));
const isWrite=(name)=>["github_create_branch","github_update_file","github_create_pull_request"].includes(name);

export async function GET_handler(_req,res) {
  res.setHeader("Cache-Control","no-store");
  return res.json({tools:definitions,writeTools:["github_create_branch","github_update_file","github_create_pull_request"],policy:"Read operations may execute automatically. Write operations require explicit user confirmation in the Max Router UI."});
}

export async function POST_handler(req,res) {
  const {name,arguments:args={},confirmed=false}=req.body||{};
  if(!definitions.some(t=>t.function.name===name))return res.status(400).json({error:"GitHub tool tidak dikenal."});
  if(isWrite(name)&&confirmed!==true)return res.status(409).json({error:"approval_required",tool:name,arguments:args});
  try {
    let result:any;
    if(name==="github_list_repositories"){
      const page=Math.max(1,Math.min(100,Number(args.page)||1)),perPage=Math.max(1,Math.min(100,Number(args.per_page)||50));
      const data=await githubFetch("/user/repos?visibility=all&affiliation=owner,collaborator,organization_member&sort=updated&per_page="+perPage+"&page="+page);
      result=data.map((r:any)=>({fullName:r.full_name,private:r.private,defaultBranch:r.default_branch,description:r.description,url:r.html_url}));
    } else {
      const {owner,repo}=args;
      if(!validPart(owner)||!validPart(repo))return res.status(400).json({error:"owner/repo tidak valid."});
      if(name==="github_list_files"||name==="github_read_file"){
        const path=args.path||"";
        if(!validPath(path))return res.status(400).json({error:"Path tidak valid."});
        const query=args.branch?"?ref="+encodeURIComponent(args.branch):"";
        const url="/repos/"+owner+"/"+repo+"/contents"+(path?"/"+path.split("/").map(encodeURIComponent).join("/"):"")+query;
        const data=await githubFetch(url);
        if(name==="github_list_files"){
          if(!Array.isArray(data))return res.status(400).json({error:"Path bukan direktori."});
          result=data.map((x:any)=>({name:x.name,path:x.path,type:x.type,size:x.size,sha:x.sha}));
        } else {
          if(data.type!=="file"||data.size>1_000_000)return res.status(413).json({error:"File bukan teks atau melebihi batas 1 MB."});
          result={path:data.path,sha:data.sha,content:data.encoding==="base64"?Buffer.from(data.content.replace(/\n/g,""),"base64").toString("utf8"):data.content};
        }
      } else if(name==="github_list_branches"){
        const data=await githubFetch("/repos/"+owner+"/"+repo+"/branches?per_page=100");
        result=data.map((x:any)=>({name:x.name,protected:x.protected,sha:x.commit?.sha}));
      } else if(name==="github_create_branch"){
        const branch=String(args.branch||"");
        if(!/^[A-Za-z0-9_.\/-]{1,200}$/.test(branch)||branch.includes(".."))return res.status(400).json({error:"Nama branch tidak valid."});
        const from=String(args.from||"main").split("/").map(encodeURIComponent).join("/");
        const base=await githubFetch("/repos/"+owner+"/"+repo+"/git/ref/heads/"+from);
        const data=await githubFetch("/repos/"+owner+"/"+repo+"/git/refs",{method:"POST",body:JSON.stringify({ref:"refs/heads/"+branch,sha:base.object.sha})});
        result={ref:data.ref,sha:data.object?.sha};
      } else if(name==="github_update_file"){
        if(!validPath(args.path)||!args.path||typeof args.content!=="string"||args.content.length>1_000_000||!args.branch||!args.message)return res.status(400).json({error:"Path, content maks 1 MB, branch dan message wajib."});
        const payload:any={message:String(args.message).slice(0,200),content:Buffer.from(args.content,"utf8").toString("base64"),branch:String(args.branch).slice(0,255)};
        if(args.sha)payload.sha=String(args.sha);
        const data=await githubFetch("/repos/"+owner+"/"+repo+"/contents/"+args.path.split("/").map(encodeURIComponent).join("/"),{method:"PUT",body:JSON.stringify(payload)});
        result={commitSha:data.commit?.sha,path:data.content?.path,blobSha:data.content?.sha};
      } else if(name==="github_create_pull_request"){
        if(!args.title||!args.head||!args.base)return res.status(400).json({error:"title, head, base wajib."});
        const data=await githubFetch("/repos/"+owner+"/"+repo+"/pulls",{method:"POST",body:JSON.stringify({title:String(args.title).slice(0,256),body:String(args.body||"").slice(0,60000),head:args.head,base:args.base,draft:Boolean(args.draft)})});
        result={number:data.number,url:data.html_url,state:data.state};
      }
    }
    return res.json({ok:true,result});
  } catch(error) {
    const e=safeGitHubError(error);return res.status(e.status).json({error:e.error});
  }
}
