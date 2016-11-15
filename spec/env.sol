pragma solidity >=0.4.0;
<%= imports %>

contract DappleEnv {

  struct Environment {
<%= signatures %>
  }
<%= environments_init %>

  function DappleEnv() {
<%= environment_spec %>
  }
}
