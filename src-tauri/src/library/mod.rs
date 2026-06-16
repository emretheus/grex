//! Library domain logic that reaches outside Grex's own database.
//!
//! The Library's canonical store is SQLite (`models::library_*`). This module
//! holds the write-through projection that mirrors selected resources into each
//! agent's *native* config files, so they also work when the agent is launched
//! from a terminal rather than through Grex.

pub mod agent_mcp;
pub mod skills;
