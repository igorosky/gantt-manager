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
        let newMonth = endDate.getMonth() + parseInt(node.properties['Duration']);
        while (newMonth > 11) {
          newMonth -= 12;
          endDate.setFullYear(endDate.getFullYear() + 1);
        }
        endDate.setMonth(newMonth);
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

  // Dates deduction
  function visitDeduce(node) {
    if (node.startDate !== undefined) return;
    node.interfaces['After'].other.forEach(visitDeduce);
    let minDate = null;
    node.interfaces['After'].other.forEach((next) => {
      if (minDate === null || next.startDate < minDate) {
        minDate = next.startDate;
      }
    });
    if (minDate === null) throw new Error('Could not deduce start date for all tasks.');
    let startDate = new Date(minDate);
    switch (node.properties['Time units']) {
      case 'Days':
        startDate.setDate(startDate.getDate() - parseInt(node.properties['Duration']));
        break;
      case 'Weeks':
        startDate.setDate(startDate.getDate() - parseInt(node.properties['Duration']) * 7);
        break;
      case 'Months':
        let newMonth = startDate.getMonth() - parseInt(node.properties['Duration']);
        while (newMonth < 0) {
          newMonth += 12;
          startDate.setFullYear(startDate.getFullYear() - 1);
        }
        startDate.setMonth(newMonth);
        break;
    }
    node.startDate = startDate;
  }
  nodes.forEach(visitDeduce);

  return nodes;
}

function generateMermaidGantt(nodes, options) {
  let ans = `gantt
  title ${options.title}
  dateFormat  DD-MM-YYYY
  axisFormat ${options.displayDateFormat}
  tickInterval ${options.tickIntervalValue}${options.tickIntervalUnit}
  todayMarker ${options.showTodayLine ? 'on' : 'off'}
`;
  if (options.tickIntervalUnit === 'week') {
    ans += `weekday ${options.weekday}\n`;
  }

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
        timeUnits = 'M';
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

function checkIfAllNodesHaveStartDates(nodes) {
  for (let node of nodes) {
    if (node.startDate === undefined) {
      return false;
    }
  }
  return true;
}

function getOptions(nodes) {
  const optionsArr = nodes.filter(n => n.name === 'Options');
  let options = {
    title: 'Gantt Chart',
    displayDateFormat: '%d-%m-%Y',
    tickIntervalValue: 1,
    tickIntervalUnit: 'week',
    weekday: 'Monday',
    showTodayLine: false,
  };
  if (optionsArr.length === 0) {
    return options;
  }
  optionsArr[0].properties.forEach((prop) => {
    switch (prop.name) {
      case 'Title':
        options.title = prop.value;
        break;
      case 'Date Format on Axis':
        options.displayDateFormat = prop.value;
        break;
      case 'Tick Interval Value':
        options.tickIntervalValue = parseInt(prop.value);
        break;
      case 'Tick Interval Unit':
        options.tickIntervalUnit = prop.value;
        break;
      case 'Weekday':
        options.weekday = prop.value;
        break;
      case 'Show Today Line':
        options.showTodayLine = prop.value === true || prop.value === 'true';
        break;
      default:
        console.warn(`Unknown option property: ${prop.name}`);
        break;
    }
  });
  return options;
}

function generateGanttChart(data) {
  if (data.nodes.filter(n => n.name === 'Start').length === 0) {
    throw new Error('The graph must contain a Start node.');
  }
  if (data.nodes.filter(n => n.name === 'Options').length > 1) {
    throw new Error('The graph must contain at most one Options node.');
  }
  const options = getOptions(data.nodes);
  data.nodes = data.nodes.filter(n => n.name !== 'Options');
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
  return generateMermaidGantt(sortedNodes, options);
}
