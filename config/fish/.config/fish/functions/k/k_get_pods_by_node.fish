function k_get_pods_by_node
  k get pods -A -o wide --field-selector spec.nodeName=$argv
end
