class Node {
  constructor(id, name, properties = [], interfaces = []) {
    this.id = id;
    this.name = name;
    this.properties = {};
    properties.forEach(prop => {
      this.properties[prop.name] = prop.value;
    });
    this.interfaces = {};
    interfaces.forEach(intf => {
      this.interfaces[intf.name] = { id: intf.id, other: [] };
    });
  }
}

function generateGraph(graph) {
  let afterToNode = {};
  let beforeToNode = {};
  let nodes = [];
  graph.nodes.forEach((node) => {
    const n = new Node(node.id, node.name, node.properties, node.interfaces);
    nodes.push(n);
    node.interfaces.forEach((intf) => {
      if (intf.name === 'After') {
        afterToNode[intf.id] = n;
      } else if (intf.name === 'Before') {
        beforeToNode[intf.id] = n;
      }
    });
  });

  // Fill connections
  graph.connections.forEach((connection) => {
    const fromNode = afterToNode[connection.from];
    const toNode = beforeToNode[connection.to];
    fromNode.interfaces['After'].other.push(toNode);
    toNode.interfaces['Before'].other.push(fromNode);
  });

  // Remove start nodes
  nodes.forEach(node => {
    if (node.name !== 'Start') return;
    const dateSplit = node.properties['Start Date'].split('-');
    node.interfaces['After'].other.forEach((toNode) => {
      toNode.interfaces['Before'].other = toNode.interfaces['Before'].other.filter(n => n.id !== node.id);
      toNode.startDate = new Date(dateSplit[2], dateSplit[1] - 1, dateSplit[0]);
    });
  });
  nodes = nodes.filter(node => node.name !== 'Start');

  return nodes;
}

function topologicalSort(nodes) {
  let sorted = [];
  let visited = new Set();

  function visit(node) {
    if (visited.has(node.id)) return;
    visited.add(node.id);
    node.interfaces['After'].other.forEach(visit);
    sorted.push(node);
  }

  nodes
    .filter((node) => node.interfaces['Before'].other.length == 0)
    .forEach(visit);

  return sorted.reverse();
}

function markDates(nodes) {
  let visited = new Set();
  function visit(node) {
    if (visited.has(node.id)) return;
    visited.add(node.id);
    let endDate = new Date(node.startDate);
    endDate.setDate(endDate.getDate() + parseInt(node.properties['Duration']));
    node.interfaces['After'].other.forEach((toNode) => {
      if (toNode.startDate === undefined || toNode.startDate < endDate) {
        toNode.startDate = new Date(endDate);
        toNode.lastBefore = node;
      }
    });
    node.interfaces['After'].other.forEach(visit);
  }
  nodes
    .filter((node) => node.startDate !== undefined)
    .forEach(visit);
  return nodes;
}

function generateMermaidGantt(nodes) {
  let ans = ''
  ans += `
gantt
  title Winter 2025/2026
  dateFormat  DD-MM-YYYY
  axisFormat %d-%m-%Y
  tickInterval 1week
  weekday tuesday
  
  section Tasks
`

  nodes.forEach((node) => {
    const dateStr = node.startDate
      .toISOString()
      .split('T')[0]
      .split('-')
      .reverse()
      .join('-');
    let modifiers = '';
    if (node.properties['State'] != 'Open') {
      if (node.properties['State'] == 'In Progress') {
        modifiers += 'active, ';
      } else if (node.properties['State'] == 'Completed') {
        modifiers += 'done, ';
      }
    }
    if (node.properties['Critical'] === true || node.properties['Critical'] === 'true') {
      modifiers += 'crit, ';
    }
    ans += `  ${node.properties['Task Name']} : ${modifiers}id_${node.id}, ${dateStr}, ${node.properties['Duration']}d\n`;
  });
  
  // ans += '\n```\n';
  return ans;
}

function generateGanttChart(data) {
  let graph = generateGraph(data.result.dataflow.graphs[0]);
  console.log(`Generated graph with ${graph.length} nodes`);
  console.log(graph);
  let sortedNodes = topologicalSort(graph);
  console.log(`Generated graph with ${sortedNodes.length} nodes 2`);
  sortedNodes = markDates(sortedNodes);
  console.log(`Generated graph with ${sortedNodes.length} nodes 3`);
  return generateMermaidGantt(sortedNodes);
}

