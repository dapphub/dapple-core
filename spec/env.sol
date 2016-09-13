pragma solidity >=0.4.0;

<%= imports %>

contract DappleEnvironment {

  struct Environment {
<%= signatures %>
  }
<%= environments_init %>

  function DappleEnvironment() {
<%= environment_spec %>
  }
}
