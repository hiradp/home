function k_get_node
  k get nodes -o json | jq ".items[]|{name:.metadata.name, labels:.metadata.labels, taints:.spec.taints}"
end
