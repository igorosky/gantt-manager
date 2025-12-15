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

function get_date(str) {
  const dateSplit = str.split('-');
  return new Date(dateSplit[2], dateSplit[1] - 1, dateSplit[0]);
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
    const date = get_date(node.properties['Start Date']);
    node.interfaces['After'].other.forEach((toNode) => {
      toNode.interfaces['Before'].other = toNode.interfaces['Before'].other.filter(n => n.id !== node.id);
      toNode.startDate = structuredClone(date);
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
    switch (node.properties['Time units']) {
      case 'Days':
        endDate.setDate(endDate.getDate() + parseInt(node.properties['Duration']));
        break;
      case 'Weeks':
        endDate.setDate(endDate.getDate() + parseInt(node.properties['Duration']) * 7);
        break;
      case 'Months':
        endDate.setMonth(endDate.getMonth() + parseInt(node.properties['Duration']));
        break;
    }
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

function generateMermaidGantt(nodes, propeties) {
  let ans = `gantt
  title ${propeties.title || 'Gantt Chart'}
  dateFormat  DD-MM-YYYY
  axisFormat %d-%m-%Y
  tickInterval 1week
  weekday tuesday
  
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
    let timeUnits;
    switch (node.properties['Time units']) {
      case 'Days':
        timeUnits = 'd';
        break;
      case 'Weeks':
        timeUnits = 'w';
        break;
      case 'Months':
        timeUnits = 'm';
        break;
    }
    if (node.properties['Critical'] === true || node.properties['Critical'] === 'true') {
      modifiers += 'crit, ';
    }
    ans += `  ${node.properties['Task Name']} : ${modifiers}id_${node.id}, ${dateStr}, ${node.properties['Duration']}${timeUnits}\n`;
  });
  
  return ans;
}

function detectCycles(nodes) {
  let visited = new Set();
  let recStack = new Set();

  function visit(node) {
    if (recStack.has(node.id)) return true;
    if (visited.has(node.id)) return false;

    visited.add(node.id);
    recStack.add(node.id);

    for (let neighbor of node.interfaces['After'].other) {
      if (visit(neighbor)) return true;
    }

    recStack.delete(node.id);
    return false;
  }

  nodes.forEach(visit);

  return false;
}

function checkNames(nodes) {
  return nodes.every((node) => {
    return node.name === 'Start' || node.properties['Task Name'] !== '';
  });
}

function checkDatesInStarts(nodes) {
  return nodes.every((node) => {
    if (node.name !== 'Start') {
      return true;
    }
    const startDate = node.properties.filter((c) => c.name === 'Start Date');
    if (startDate.length !== 1 || startDate[0].value === '') {
      return false;
    }
    try {
      get_date(startDate[0].value);
      return true;
    } catch (e) {
      return false;
    }
  });
}

function checkIfAllNodesHaveStartDates(nodes) {
  for (let node of nodes) {
    if (node.startDate === undefined) {
      return false;
    }
  }
  return true;
}

function generateGanttChart(data, propeties) {
  if (!checkDatesInStarts(data.nodes)) {
    throw new Error('All Starts must have a start date.');
  }
  let graph = generateGraph(data);
  if (!checkNames(graph)) {
    throw new Error('All tasks must have a name.');
  }
  if (detectCycles(graph)) {
    throw new Error('The graph contains cycles. Cannot generate Gantt chart.');
  }
  let sortedNodes = topologicalSort(graph);
  sortedNodes = markDates(sortedNodes);
  if (!checkIfAllNodesHaveStartDates(sortedNodes)) {
    throw new Error('Could not determine start dates for all tasks.');
  }
  return generateMermaidGantt(sortedNodes, propeties);
}
