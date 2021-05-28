<script>
    import Hidden from './hidden.svelte';
	import Hiddens from './VirtualList.svelte'
	import Hide from './ListItem.svelte'
	
    let child;
	let classname
	let name
	let hname

	

	
    
</script>

<div class="header">
<strong> VSInterest: </strong>
<link href= "./out/compiled/helloworld.css" rel = "stylesheet">
</div>
<p> Here you can find Github repos of similar languages.</p>
<p> Here is the <a href="https://github.com/Mehak-Mehta/VSInterest"> Source Code </a>.</p>


Select language: 


<button on:click={child.show}>Python</button>

<Hidden bind:this={child} on:show={e => child.shown = e.detail}>
    <div class="links">
	<li><a href="https://github.com/Mehak-Mehta/Sudoku-Solver">Sudoku Solver</a>
	<p> Sudoku Solver Using Backtracing Algorithum</p>
	</li>
	</div>

	<div class="Acc">
	<li><a href="https://github.com/Mehak-Mehta/Account-Storage">Account Storage</a>
	<p> GUI for Account Storage Using tkinter</p>
	</li>
	</div>

	<div class="pass">
	<li><a href="https://github.com/Mehak-Mehta/Password-Generator">PassWord Generator</a>
	<p> Simple PassWord Generator Using Python</p>
	</li>
	</div>
	
</Hidden>

<button on:click={classname.show}>JavaScript</button>

<Hidden bind:this={classname} on:show={e => classname.shown = e.detail}>
    <div class="links">
	<li><a href="https://github.com/Mehak-Mehta/Apollo-GraphQL-Server">Apollo GraphQL Server</a>
	<p>Apollo graphql server with express and mongoDB</p>
	</li>
	</div>

	<div class="links">
	<li><a href="https://github.com/Mehak-Mehta/Express.js-API">Express.js API</a>
	</li>
	<p>REST API Using Node , Express , MongoDB</p>
	</div>
	
	<div class="links">
	<li><a href="https://github.com/Mehak-Mehta/HunterxHunter-Web">Hunter x Hunter</a>
	</li>
	<p>Front-end Hunter x Hunter Web Using React.</p>
	</div>
</Hidden>

<button on:click={name.show}>TypeScript</button>
<Hidden bind:this={name} on:show={e => name.shown = e.detail}>
    <div class="links">
	<li><a href="https://github.com/Mehak-Mehta/Nest-GraphQL-Server">Nest GraphQL Server</a>
	<p> Nest graphql server with mongoDB</p>
	</li>
	</div>

	<div class="links">
	<li><a href="https://github.com/benawad/vstodo">vstodo</a>
	</li>
	<p>Todo list for VSCode</p> <strong>Owner: benawad</strong>
	</div>
	
	<div class="links">
	<li><a href="https://github.com/bradtraversy/deno-rest-api">deno rest api</a>
	</li>
	<p>Simple REST API using Deno and Oak</p> <strong>Owner: bradtraversy</strong>
	</div>
</Hidden>

<button on:click={hname.show}>Html & CSS</button>
<Hidden bind:this={hname} on:show={e => hname.shown = e.detail}>
    <div class="links">
	<li><a href="https://github.com/Mehak-Mehta/WebTemp">Website Template</a>
	<p > Basic HTML Website</p>
	</li>
	</div>

	<div class="links">
	<li><a href="https://github.com/Alicunde/HTML">HTML elements</a>
	<p>Set of simplified and stylized HTML elements</p> <strong>Owner: Alicunde</strong>
	</li>
	
	</div>
	
	<div class="links">
	<li><a href="https://github.com/bornmay/Responsive-Portfolio">Responsive Portfolio</a>
	<p>This is a Responsive Portfolio Website</p> <strong>Owner: bornmay </strong>
	</li>
	
	</div>
</Hidden>
<style>
	.links{
	margin: 5px
	
	}

	a{
	text-decoration: none;
	}

	a:hover{
	color: pink;
	}

	.header{
	margin: 2px;
	}
</style>



<div> More languages coming soon!!</div>

<div color: pink> Made By <a href="https://github.com/Mehak-Mehta">Mehak Mehta</a></div>

