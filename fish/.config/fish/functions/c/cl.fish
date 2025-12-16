function cl --argument-names scope
    if test -n "$scope"
        c clippy -p $scope --tests --benches --examples --bins -- -D warnings
    else
        c clippy --workspace --tests --benches --examples --bins -- -D warnings
    end
end
